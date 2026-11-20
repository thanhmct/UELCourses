"""Fuzzy verbatim matching used to post-check LLM citations."""
from __future__ import annotations

from difflib import SequenceMatcher

from .textnorm import collapse_ws

QUOTE_MIN_RATIO = 0.9


def _norm(s: str) -> str:
    return collapse_ws(s).lower().strip(" \"'«»“”‘’.…")


def best_match(quote: str, text: str) -> tuple[float, str]:
    """Return (similarity 0..1, best matching verbatim span of `text`) for `quote`."""
    q, t = _norm(quote), collapse_ws(text)
    tl = t.lower()
    if not q:
        return 0.0, ""
    pos = tl.find(q)
    if pos >= 0:
        return 1.0, t[pos:pos + len(q)]
    L = len(q)
    if L >= len(tl):
        return SequenceMatcher(None, tl, q, autojunk=False).ratio(), t
    step = max(1, L // 20)
    best, best_start = 0.0, 0
    for start in range(0, len(tl) - L + 1, step):
        r = SequenceMatcher(None, tl[start:start + L], q, autojunk=False).ratio()
        if r > best:
            best, best_start = r, start
    best_len = L
    lo, hi = max(0, best_start - step), min(len(tl) - L, best_start + step)
    for start in range(lo, hi + 1):
        for ln in (L - 2, L, L + 2):
            if ln <= 0 or start + ln > len(tl):
                continue
            r = SequenceMatcher(None, tl[start:start + ln], q, autojunk=False).ratio()
            if r > best:
                best, best_start, best_len = r, start, ln
    return best, t[best_start:best_start + best_len]


def is_verbatim(quote: str, text: str, threshold: float = QUOTE_MIN_RATIO) -> bool:
    return best_match(quote, text)[0] >= threshold
