from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pikepdf

from papyrus_api.core.errors import PdfEncryptedError, PdfMalformedError, ValidationError
from papyrus_api.services.pdf.limits import enforce_page_cap

_GRID_BY_PAGES_PER_SHEET: dict[int, tuple[int, int]] = {
    2: (1, 2),
    4: (2, 2),
    6: (2, 3),
    9: (3, 3),
    16: (4, 4),
}

_CELL_MARGIN_PT = 10.0


@dataclass(slots=True, frozen=True)
class NupResult:
    output_path: Path
    output_size_bytes: int
    input_size_bytes: int
    page_count: int
    source_page_count: int


def _cell_rect(
    *,
    col: int,
    row: int,
    cols: int,
    rows: int,
    sheet_width: float,
    sheet_height: float,
) -> pikepdf.Rectangle:
    cell_width = sheet_width / cols
    cell_height = sheet_height / rows
    x0 = col * cell_width + _CELL_MARGIN_PT
    x1 = (col + 1) * cell_width - _CELL_MARGIN_PT
    top_offset = row * cell_height
    y1 = sheet_height - top_offset - _CELL_MARGIN_PT
    y0 = sheet_height - top_offset - cell_height + _CELL_MARGIN_PT
    return pikepdf.Rectangle(x0, y0, x1, y1)


def nup_pdf(
    *,
    input_path: Path,
    output_path: Path,
    pages_per_sheet: int,
    max_pages: int | None = None,
) -> NupResult:
    grid = _GRID_BY_PAGES_PER_SHEET.get(pages_per_sheet)
    if grid is None:
        raise ValidationError(
            "Pages per sheet must be one of 2, 4, 6, 9, or 16.",
            details={"pages_per_sheet": pages_per_sheet},
        )
    cols, rows = grid

    if not input_path.exists() or input_path.stat().st_size == 0:
        raise PdfMalformedError("Input file is empty.")

    try:
        src = pikepdf.open(str(input_path))
    except pikepdf.PasswordError as exc:
        raise PdfEncryptedError("PDF is password-protected.") from exc
    except pikepdf.PdfError as exc:
        raise PdfMalformedError("This PDF appears to be malformed.") from exc

    with src:
        source_page_count = len(src.pages)
        enforce_page_cap(source_page_count, max_pages)

        first_box = pikepdf.Rectangle(src.pages[0].mediabox)
        sheet_width = first_box.width
        sheet_height = first_box.height

        dst = pikepdf.Pdf.new()
        for start in range(0, source_page_count, pages_per_sheet):
            sheet = dst.add_blank_page(page_size=(sheet_width, sheet_height))
            group = src.pages[start : start + pages_per_sheet]
            for index, source_page in enumerate(group):
                col = index % cols
                row = index // cols
                sheet.add_overlay(
                    source_page,
                    _cell_rect(
                        col=col,
                        row=row,
                        cols=cols,
                        rows=rows,
                        sheet_width=sheet_width,
                        sheet_height=sheet_height,
                    ),
                )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        dst.save(str(output_path))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise ValidationError("Could not build the n-up PDF.")

    with pikepdf.open(str(output_path)) as pdf:
        page_count = len(pdf.pages)

    return NupResult(
        output_path=output_path,
        output_size_bytes=output_path.stat().st_size,
        input_size_bytes=input_path.stat().st_size,
        page_count=page_count,
        source_page_count=source_page_count,
    )


__all__ = ["NupResult", "nup_pdf"]
