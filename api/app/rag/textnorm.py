"""Vietnamese text normalisation and tokenisation helpers."""
from __future__ import annotations

import re
import unicodedata

_WS_RE = re.compile(r"[ \t  -​  　]+")
_TOKEN_RE = re.compile(r"[0-9a-zA-ZÀ-ɏḀ-ỿ]+(?:[.,][0-9]+)*")

# Small stopword list (function words + question words). Applied to unigrams only.
STOPWORDS = {
    "của", "và", "là", "các", "những", "được", "cho", "có", "trong", "theo", "này", "với",
    "thì", "khi", "bao", "nhiêu", "gì", "nào", "như", "thế", "tôi", "em", "mình", "bạn",
    "ạ", "à", "nhé", "vậy", "sao", "hay", "hoặc", "để", "về", "từ", "đến", "tại", "do",
    "ra", "một", "bị", "đã", "sẽ", "đang", "phải", "muốn", "hỏi", "cần", "làm", "ai",
    "đó", "nếu", "mà", "thể", "bằng", "lại", "không", "cũng", "rằng", "xem", "coi", "biết", "giúp",
    "quy", "định",  # "quy định" appears everywhere -> noise in queries
}
STOPWORDS_ASCII: set[str] = set()


def nfc(text: str) -> str:
    """Unicode NFC + whitespace cleanup (keeps line breaks)."""
    text = unicodedata.normalize("NFC", text)
    text = text.replace("­", "").replace("﻿", "").replace("\r\n", "\n").replace("\r", "\n")
    text = _WS_RE.sub(" ", text)
    return text


def collapse_ws(text: str) -> str:
    return " ".join(nfc(text).split())


def strip_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return unicodedata.normalize("NFC", "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn"))


def has_accents(text: str) -> bool:
    return strip_accents(text) != text


def syllables(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(nfc(text))]


STOPWORDS_ASCII = {strip_accents(w) for w in STOPWORDS}


def features(text: str, *, query: bool = False) -> list[str]:
    """Token features for BM25.

    Features = syllables + syllable bigrams (with diacritics) + the same with diacritics removed
    (prefixed with "~"). A query typed without diacritics only produces "~" features, so it still
    matches accented documents; an accented query matches both (exact matches score higher).
    """
    syl = syllables(text)
    accented_query = has_accents(text)
    feats: list[str] = []
    stripped = [strip_accents(s) for s in syl]
    use_accented = (not query) or accented_query
    for i, s in enumerate(syl):
        st = stripped[i]
        stop = s in STOPWORDS or (not accented_query and query and st in STOPWORDS_ASCII)
        if not stop:
            if use_accented:
                feats.append(s)
            feats.append("~" + st)
        if i + 1 < len(syl):
            nxt = syl[i + 1]
            nxt_stop = nxt in STOPWORDS or (query and not accented_query and stripped[i + 1] in STOPWORDS_ASCII)
            if stop and nxt_stop:
                continue
            if use_accented:
                feats.append(s + "_" + nxt)
            feats.append("~" + st + "_" + stripped[i + 1])
    return feats


def content_terms(text: str) -> list[str]:
    """Accent-stripped content unigrams (used for coverage / refusal decisions)."""
    out = []
    for s in syllables(text):
        if s in STOPWORDS:
            continue
        st = strip_accents(s)
        if st in STOPWORDS_ASCII and not has_accents(s):
            continue
        out.append(st)
    return out
