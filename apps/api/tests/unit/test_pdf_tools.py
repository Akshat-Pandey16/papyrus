from __future__ import annotations

import zipfile
from pathlib import Path

import pikepdf
import pytest
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

from papyrus_api.core.errors import (
    PdfNotEncryptedError,
    PdfWrongPasswordError,
)
from papyrus_api.services.pdf.crop import crop_pdf, normalize_box
from papyrus_api.services.pdf.images import PageSize, images_to_pdf
from papyrus_api.services.pdf.overlay import LineOp, RectOp, TextOp, apply_overlay
from papyrus_api.services.pdf.page_numbers import PageNumberOptions, number_pages_pdf
from papyrus_api.services.pdf.pdf_to_images import ImageFormat, pdf_to_images
from papyrus_api.services.pdf.redact import redact_pdf, redactions_from_payload
from papyrus_api.services.pdf.security import protect_pdf, unlock_pdf
from papyrus_api.services.pdf.watermark import WatermarkOptions, watermark_pdf


def _make_pdf(path: Path, pages: int = 3) -> None:
    c = rl_canvas.Canvas(str(path), pagesize=(612, 792))
    for i in range(pages):
        c.drawString(72, 700, f"Sample page {i + 1} with secret text")
        c.showPage()
    c.save()


def _page_count(path: Path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def test_security_roundtrip(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    protected = tmp_path / "protected.pdf"
    result = protect_pdf(
        input_path=src,
        output_path=protected,
        user_password="hunter2",
        allow_printing=True,
        allow_copying=False,
    )
    assert result.encrypted
    with pikepdf.open(str(protected), password="hunter2") as pdf:
        assert pdf.is_encrypted

    unlocked = tmp_path / "unlocked.pdf"
    result2 = unlock_pdf(input_path=protected, output_path=unlocked, password="hunter2")
    assert not result2.encrypted
    with pikepdf.open(str(unlocked)) as pdf:
        assert not pdf.is_encrypted


def test_unlock_wrong_password(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    protected = tmp_path / "protected.pdf"
    protect_pdf(input_path=src, output_path=protected, user_password="correct")
    with pytest.raises(PdfWrongPasswordError):
        unlock_pdf(input_path=protected, output_path=tmp_path / "x.pdf", password="wrong")


def test_unlock_unencrypted_raises(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    with pytest.raises(PdfNotEncryptedError):
        unlock_pdf(input_path=src, output_path=tmp_path / "x.pdf", password="anything")


def test_crop_shrinks_mediabox(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    out = tmp_path / "cropped.pdf"
    box = normalize_box({"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5})
    result = crop_pdf(input_path=src, output_path=out, box=box)
    assert result.pages_cropped == 3
    with pikepdf.open(str(out)) as pdf:
        mb = pdf.pages[0].mediabox
        width = float(mb[2]) - float(mb[0])
        assert abs(width - 0.5 * 612) < 1.0


def test_watermark_applies_to_all_pages(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    out = tmp_path / "wm.pdf"
    result = watermark_pdf(
        input_path=src,
        output_path=out,
        options=WatermarkOptions(text="DRAFT", tile=False),
    )
    assert result.page_count == 3
    assert result.ops_applied == 3
    assert _page_count(out) == 3


def test_page_numbers(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    out = tmp_path / "pn.pdf"
    result = number_pages_pdf(
        input_path=src,
        output_path=out,
        options=PageNumberOptions(fmt="{n} / {total}", position="bottom-right"),
    )
    assert result.ops_applied == 3


def test_overlay_ops(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src)
    out = tmp_path / "ov.pdf"
    ops = [
        TextOp(page=1, text="Hello", x=0.2, y=0.3, size=18),
        RectOp(page=1, x=0.1, y=0.1, w=0.2, h=0.1, fill=(0.0, 0.0, 0.0)),
        LineOp(page=2, points=((0.1, 0.1), (0.5, 0.5), (0.8, 0.2))),
    ]
    result = apply_overlay(input_path=src, output_path=out, ops=ops)
    assert result.ops_applied == 3
    assert _page_count(out) == 3


def test_pdf_to_images_zip(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src, pages=4)
    out = tmp_path / "imgs.zip"
    result = pdf_to_images(
        input_path=src,
        output_path=out,
        image_format=ImageFormat.JPEG,
        dpi=72,
    )
    assert result.images == 4
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
    assert len(names) == 4
    assert all(n.endswith(".jpg") for n in names)


def test_images_to_pdf(tmp_path: Path) -> None:
    img1 = tmp_path / "a.png"
    img2 = tmp_path / "b.jpg"
    Image.new("RGBA", (400, 300), (255, 0, 0, 128)).save(img1)
    Image.new("RGB", (300, 500), (0, 128, 255)).save(img2)
    out = tmp_path / "from-images.pdf"
    result = images_to_pdf(
        image_paths=[img1, img2],
        output_path=out,
        work_dir=tmp_path / "work",
        page_size=PageSize.AUTO,
    )
    assert result.page_count == 2
    assert _page_count(out) == 2


def test_redact_flattens_pages(tmp_path: Path) -> None:
    src = tmp_path / "in.pdf"
    _make_pdf(src, pages=3)
    out = tmp_path / "redacted.pdf"
    redactions = redactions_from_payload(
        [
            {"page": 1, "x": 0.05, "y": 0.05, "w": 0.9, "h": 0.2},
            {"page": 3, "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
        ]
    )
    result = redact_pdf(input_path=src, output_path=out, redactions=redactions, dpi=100)
    assert result.pages_redacted == 2
    assert result.boxes_applied == 2
    assert _page_count(out) == 3
