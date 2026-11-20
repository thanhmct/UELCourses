"""Validity (hiệu lực) of regulation documents and cohort (khóa) applicability."""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Iterable

from .models import RegulationDoc, parse_date

ACTIVE, EXPIRED, SUPERSEDED, UPCOMING = "active", "expired", "superseded", "upcoming"
DEFAULT_EXPIRING_DAYS = 90


"""Cohort convention (UEL): cohort code = last two digits of the enrolment year
(K22 = tuyển sinh 2022). A regulation applies only to the cohorts it lists, except an
open-ended rule "từ khóa X trở đi" (``applies_from_cohort``), see `cohort_applies`."""


def _num(x: str | int) -> int:
    n = int(x)
    return n % 100 if n >= 1900 else n  # "2022" -> 22


def normalize_cohort(value: str | int | None) -> str | None:
    """'K22', 'k22', 'K 22', '22', '2022', 'Khóa 2022' -> 'K22'; 'all'/'tất cả' -> 'all'."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    low = s.lower()
    if low in ("all", "*", "tất cả", "tat ca", "toàn trường"):
        return "all"
    m = re.search(r"(\d{4}|\d{1,2})", s)
    return f"K{_num(m.group(1)):02d}" if m else s.upper()


def cohort_no(c: str | None) -> int | None:
    c = normalize_cohort(c)
    m = re.fullmatch(r"K(\d+)", c or "")
    return int(m.group(1)) if m else None


def cohort_matches(spec: Iterable[str], cohort: str | None) -> bool:
    """Does a catalog cohort list (e.g. ["K22","K23"], ["K23+"], ["K15-K20"], ["all"]) cover `cohort`?"""
    cohort = normalize_cohort(cohort)
    specs = [str(s).strip() for s in spec]
    if cohort is None or not specs:
        return True  # no cohort asked, or catalog does not know the cohorts (treated as possibly applicable)
    n = cohort_no(cohort)
    for s in specs:
        low = s.lower()
        if low in ("all", "*", "tất cả"):
            return True
        if cohort == "all":
            continue
        rng = re.fullmatch(r"[Kk]?\s*(\d+)\s*[-–]\s*[Kk]?\s*(\d+)", s)
        if rng:
            if n is not None and _num(rng.group(1)) <= n <= _num(rng.group(2)):
                return True
            continue
        plus = re.fullmatch(r"(?:[Kk]?\s*(\d+)\s*\+|(?:từ|tu)\s*(?:khóa\s*)?[Kk]?\s*(\d+).*)", s, re.IGNORECASE)
        if plus:
            if n is not None and n >= _num(plus.group(1) or plus.group(2)):
                return True
            continue
        if normalize_cohort(s) == cohort:
            return True
    return False


def _max_listed(doc: RegulationDoc) -> int | None:
    nums = [cohort_no(c) for c in doc.applies_to_cohorts if re.fullmatch(r"[Kk]?\s*\d+", c.strip())]
    nums = [x for x in nums if x is not None]
    return max(nums) if nums else None


def _open_range_end(doc: RegulationDoc, docs_by_id: dict[str, RegulationDoc]) -> int | None:
    """Last cohort covered by an open-ended doc (None = unbounded).

    If the doc was superseded by a newer one that itself starts at cohort Y, the old one covers up to Y-1.
    If it was superseded and the newer start is unknown, the open range is not extended at all.
    """
    if not doc.superseded_by:
        return None
    newer = docs_by_id.get(doc.superseded_by)
    start = cohort_no(newer.applies_from_cohort) if newer and newer.applies_from_cohort else None
    if start is None and newer is not None:
        listed = [cohort_no(c) for c in newer.applies_to_cohorts]
        listed = [x for x in listed if x is not None]
        start = min(listed) if listed else None
    if start is None:
        return -1  # unknown -> no extension
    return start - 1


def cohort_applies(doc: RegulationDoc, cohort: str | None,
                   docs_by_id: dict[str, RegulationDoc] | None = None) -> bool:
    if cohort_matches(doc.applies_to_cohorts, cohort):
        return True
    start = cohort_no(doc.applies_from_cohort) if doc.applies_from_cohort else None
    n = cohort_no(cohort)
    if start is None or n is None or n < start:
        return False
    end = _open_range_end(doc, docs_by_id or {})
    until = cohort_no(doc.applies_until_cohort) if doc.applies_until_cohort else None
    if until is not None:
        end = until if end is None else min(end, until)
    return end is None or n <= end


_FROM_COHORT_RES = [
    # "từ khóa K23 trở về sau", "từ khóa tuyển sinh 2023 trở đi", "kể từ khóa 23 về sau"
    re.compile(r"(?:kể\s+)?từ\s+(?:các\s+)?khóa(?:\s+tuyển\s+sinh)?(?:\s+năm)?\s+K?\s*(\d{4}|\d{2})\b"
               r"(?:\s*\([^)]*\))?\s*(?:trở\s+(?:đi|về\s+sau)|về\s+sau|trở\s+lên)", re.IGNORECASE),
    # "áp dụng cho khóa tuyển sinh từ tháng 09 năm 2025" / "khóa tuyển sinh từ năm 2025"
    re.compile(r"khóa\s+tuyển\s+sinh\s+từ\s+(?:tháng\s+\d{1,2}\s*(?:năm|/)\s*|năm\s+)?(\d{4})", re.IGNORECASE),
    re.compile(r"\bK\s*(\d{2})\s*trở\s+(?:đi|về\s+sau)", re.IGNORECASE),
]


def infer_applies_from(text: str) -> str | None:
    """Find an open-ended cohort rule ("từ khóa X trở đi") in free text; returns e.g. 'K23'."""
    from .textnorm import nfc

    t = nfc(text or "")
    for rx in _FROM_COHORT_RES:
        m = rx.search(t)
        if m:
            return normalize_cohort(m.group(1))
    return None


def resolve_applies_from(docs: list[RegulationDoc]) -> None:
    """List-based inference: the newest document of a supersession chain whose cohort list is explicit
    also governs later (unlisted) cohorts, starting from its first listed cohort — unless another
    in-force document in the same chain family already lists those later cohorts (we then stop there)."""
    replaced_by = {o.superseded_by for o in docs if o.superseded_by}
    for d in docs:
        newest_in_chain = (bool(d.supersedes) or d.doc_id in replaced_by) and not d.superseded_by
        if d.applies_from_cohort or not newest_in_chain or not is_cohort_specific(d):
            continue
        listed = [x for x in (cohort_no(c) for c in d.applies_to_cohorts) if x is not None]
        if listed:
            d.applies_from_cohort = f"K{min(listed):02d}"
            d.applies_from_source = "chain"
    # cap open-ended ranges where a later document of the same family lists later cohorts
    for d in docs:
        d.applies_until_cohort = None
        if not d.applies_from_cohort:
            continue
        start = cohort_no(d.applies_from_cohort) or 0
        top = max(_max_listed(d) or start, start)
        caps = []
        for o in docs:
            if o is d or not is_cohort_specific(o) or not _same_family(d, o):
                continue
            later = [x for x in (cohort_no(c) for c in o.applies_to_cohorts) if x is not None and x > top]
            if o.applies_from_cohort and (cohort_no(o.applies_from_cohort) or 0) > top:
                later.append(cohort_no(o.applies_from_cohort))
            if later:
                caps.append(min(later) - 1)
        if caps:
            d.applies_until_cohort = f"K{min(caps):02d}"


def _family_key(title: str) -> str:
    from .textnorm import strip_accents

    words = re.findall(r"\w+", strip_accents(title.lower()))
    return " ".join(words[:5])


def _same_family(a: RegulationDoc, b: RegulationDoc) -> bool:
    if _family_key(a.title) == _family_key(b.title):
        return True
    ta, tb = {t.lower() for t in a.topics}, {t.lower() for t in b.topics}
    return len(ta & tb) >= 2

def compute_status(doc: RegulationDoc, today: date, docs_by_id: dict[str, RegulationDoc] | None = None) -> str:
    docs_by_id = docs_by_id or {}
    eff_from = parse_date(doc.effective_from)
    eff_to = parse_date(doc.effective_to)
    if eff_from and eff_from > today:
        return UPCOMING
    if doc.superseded_by:
        newer = docs_by_id.get(doc.superseded_by)
        newer_from = parse_date(newer.effective_from) if newer else None
        if newer is None or newer_from is None or newer_from <= today:
            return SUPERSEDED
    if eff_to and eff_to < today:
        return EXPIRED
    declared = (doc.catalog_status or "").lower()
    if declared in (EXPIRED, SUPERSEDED) and not eff_to and not doc.superseded_by:
        return declared  # catalog says so and we have no dates to contradict it
    return ACTIVE


def refresh_statuses(docs: list[RegulationDoc], today: date) -> None:
    """Fill superseded_by from `supersedes` links, then compute status for every doc (in place)."""
    by_id = {d.doc_id: d for d in docs}
    for d in docs:
        for old_id in d.supersedes or []:
            old = by_id.get(old_id)
            if old is not None and not old.superseded_by:
                old.superseded_by = d.doc_id
    for d in docs:
        d.status = compute_status(d, today, by_id)
    resolve_applies_from(docs)


def days_until_expiry(doc: RegulationDoc, today: date) -> int | None:
    eff_to = parse_date(doc.effective_to)
    return (eff_to - today).days if eff_to else None


def expiring(docs: list[RegulationDoc], today: date, within_days: int = DEFAULT_EXPIRING_DAYS) -> list[RegulationDoc]:
    limit = today + timedelta(days=within_days)
    out = []
    for d in docs:
        eff_to = parse_date(d.effective_to)
        if d.status == ACTIVE and eff_to and today <= eff_to <= limit:
            out.append(d)
    return sorted(out, key=lambda d: d.effective_to or "")


def applicable_docs(docs: list[RegulationDoc], cohort: str | None, today: date,
                    include_inactive: bool = False) -> list[RegulationDoc]:
    """Docs that apply to `cohort` and are in force today (or all statuses if include_inactive)."""
    out = []
    by_id = {d.doc_id: d for d in docs}
    for d in docs:
        if not cohort_applies(d, cohort, by_id):
            continue
        if not include_inactive and d.status != ACTIVE:
            continue
        out.append(d)
    return out


def _fmt(d: str | None) -> str:
    dt = parse_date(d)
    return dt.strftime("%d/%m/%Y") if dt else (d or "?")


def doc_label(doc: RegulationDoc) -> str:
    if doc.decision_no:
        return f"Quyết định số {doc.decision_no}"
    return doc.title


def validity_warnings(doc: RegulationDoc, today: date, within_days: int = DEFAULT_EXPIRING_DAYS,
                      docs_by_id: dict[str, RegulationDoc] | None = None) -> list[str]:
    docs_by_id = docs_by_id or {}
    label = doc_label(doc)
    out = []
    if doc.status == SUPERSEDED:
        newer = docs_by_id.get(doc.superseded_by or "")
        newer_label = doc_label(newer) if newer else (doc.superseded_by or "văn bản khác")
        out.append(f"{label} đã bị thay thế bởi {newer_label}.")
    elif doc.status == EXPIRED:
        out.append(f"{label} đã hết hiệu lực từ ngày {_fmt(doc.effective_to)}.")
    elif doc.status == UPCOMING:
        out.append(f"{label} chưa có hiệu lực (có hiệu lực từ ngày {_fmt(doc.effective_from)}).")
    else:
        left = days_until_expiry(doc, today)
        if left is not None and 0 <= left <= within_days:
            out.append(f"{label} sắp hết hiệu lực vào ngày {_fmt(doc.effective_to)} (còn {left} ngày).")
        if doc.superseded_by and doc.superseded_by in docs_by_id:
            newer = docs_by_id[doc.superseded_by]
            out.append(f"{label} sẽ được thay thế bởi {doc_label(newer)} từ ngày {_fmt(newer.effective_from)}.")
    if doc.metadata_unverified:
        out.append(f"{doc.title}: metadata chưa được xác minh (số quyết định, ngày hiệu lực hoặc khóa áp dụng "
                   "có thể chưa chính xác) — hãy đối chiếu văn bản gốc.")
    if not doc.applies_to_cohorts and not doc.applies_from_cohort:
        out.append(f"{doc.title}: chưa xác định khóa áp dụng.")
    return out


def is_cohort_specific(doc: RegulationDoc) -> bool:
    specs = [s.lower() for s in doc.applies_to_cohorts]
    return bool(specs) and not any(s in ("all", "*", "tất cả") for s in specs)
