from __future__ import annotations

from papyrus_api.core.errors import ValidationError

_MAX_SPEC_LEN = 512


def parse_flat(spec: str | None, *, page_count: int) -> list[int]:
    if page_count <= 0:
        raise ValidationError("Document has no pages.")
    if spec is None:
        return list(range(page_count))
    cleaned = spec.strip()
    if not cleaned:
        return list(range(page_count))
    if len(cleaned) > _MAX_SPEC_LEN:
        raise ValidationError("Page range spec is too long.")

    seen: set[int] = set()
    out: list[int] = []
    for raw in (p.strip() for p in cleaned.split(",")):
        if not raw:
            continue
        if "-" in raw:
            lo_raw, hi_raw = raw.split("-", 1)
            lo_raw = lo_raw.strip()
            hi_raw = hi_raw.strip()
            try:
                lo = int(lo_raw) if lo_raw else 1
                hi = int(hi_raw) if hi_raw else page_count
            except ValueError as exc:
                raise ValidationError(f"Invalid range '{raw}'.") from exc
            if lo < 1 or hi < lo or hi > page_count:
                raise ValidationError(
                    f"Range '{raw}' is out of bounds for {page_count}-page document.",
                )
            for page in range(lo - 1, hi):
                if page in seen:
                    continue
                seen.add(page)
                out.append(page)
        else:
            try:
                page = int(raw)
            except ValueError as exc:
                raise ValidationError(f"Invalid page '{raw}'.") from exc
            if page < 1 or page > page_count:
                raise ValidationError(
                    f"Page '{raw}' is out of bounds for {page_count}-page document.",
                )
            zero_indexed = page - 1
            if zero_indexed in seen:
                continue
            seen.add(zero_indexed)
            out.append(zero_indexed)

    if not out:
        raise ValidationError("Page range must select at least one page.")
    return out


def parse_groups(spec: str, *, page_count: int) -> list[list[int]]:
    if page_count <= 0:
        raise ValidationError("Document has no pages.")
    raw_parts = [p.strip() for p in spec.split(",") if p.strip()]
    if not raw_parts:
        raise ValidationError("Split spec must contain at least one range.")
    groups: list[list[int]] = []
    for raw in raw_parts:
        if "-" in raw:
            lo_raw, hi_raw = raw.split("-", 1)
            try:
                lo = int(lo_raw)
                hi = int(hi_raw)
            except ValueError as exc:
                raise ValidationError(f"Invalid range '{raw}'.") from exc
            if lo < 1 or hi < lo or hi > page_count:
                raise ValidationError(
                    f"Range '{raw}' is out of bounds for {page_count}-page document.",
                )
            groups.append(list(range(lo - 1, hi)))
        else:
            try:
                page = int(raw)
            except ValueError as exc:
                raise ValidationError(f"Invalid page '{raw}'.") from exc
            if page < 1 or page > page_count:
                raise ValidationError(
                    f"Page '{raw}' is out of bounds for {page_count}-page document.",
                )
            groups.append([page - 1])
    return groups
