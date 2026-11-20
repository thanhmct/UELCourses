"""Biểu thức điều kiện học phần (tiên quyết / học trước) kiểu PrereqTree của NUSMods.

Cây: chuỗi mã ("EN21") | {"and": [cây...]} | {"or": [cây...]}.

Cú pháp chuỗi nguồn (HPHocTruoc / HPTienQuyet của CTĐT UEL — định dạng nhiều mã CHƯA xác minh):
* khoảng trắng đầu/cuối bỏ qua (" TATC");
* nhiều mã ngăn bởi "," ";" "+" "&" hoặc khoảng trắng => VÀ (giả định);
* "/" "|" "hoặc" "or" => HOẶC; "và" "and" => VÀ; VÀ ưu tiên hơn HOẶC; hỗ trợ ngoặc ().
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from typing import Any

Tree = str | dict[str, list[Any]]

_TOKEN_RE = re.compile(
    r"\(|\)|[,;+&]|/|\||(?<![\w])(?:hoặc|hoac|or|và|va|and)(?![\w])|[A-Za-z0-9_.\-]+",
    re.IGNORECASE,
)
_OR_WORDS = {"hoặc", "hoac", "or", "/", "|"}
_AND_WORDS = {"và", "va", "and", ",", ";", "+", "&"}


def _tokens(text: str) -> list[str]:
    out = []
    for m in _TOKEN_RE.finditer(text):
        t = m.group(0)
        low = t.lower()
        if low in _OR_WORDS:
            out.append("|")
        elif low in _AND_WORDS:
            out.append("&")
        elif t in "()":
            out.append(t)
        else:
            out.append(t.strip(".-_").upper() if t.strip(".-_") else "")
    return [t for t in out if t]


def _combine(op: str, items: list[Tree]) -> Tree | None:
    flat: list[Tree] = []
    for it in items:
        if it is None:
            continue
        if isinstance(it, dict) and op in it:
            flat.extend(it[op])
        else:
            flat.append(it)
    uniq: list[Tree] = []
    for it in flat:
        if it not in uniq:
            uniq.append(it)
    if not uniq:
        return None
    return uniq[0] if len(uniq) == 1 else {op: uniq}


class _Parser:
    def __init__(self, toks: list[str]):
        self.toks, self.i = toks, 0

    def peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else None

    def take(self):
        t = self.peek()
        self.i += 1
        return t

    def parse_or(self) -> Tree | None:
        items = [self.parse_and()]
        while self.peek() == "|":
            self.take()
            items.append(self.parse_and())
        return _combine("or", items)

    def parse_and(self) -> Tree | None:
        items = [self.parse_atom()]
        while self.peek() not in (None, "|", ")"):
            if self.peek() == "&":
                self.take()
                if self.peek() in (None, "|", ")"):
                    break
            items.append(self.parse_atom())
        return _combine("and", items)

    def parse_atom(self) -> Tree | None:
        t = self.take()
        if t == "(":
            inner = self.parse_or()
            if self.peek() == ")":
                self.take()
            return inner
        if t in (None, ")", "&", "|"):
            return None
        return t


def parse_requirement(text: Any) -> Tree | None:
    """Không bao giờ ném lỗi; chuỗi rỗng/None -> None."""
    if text is None:
        return None
    if isinstance(text, (list, tuple)):
        return _combine("and", [parse_requirement(t) for t in text])
    s = str(text).strip()
    if not s or s.lower() in ("-", "không", "khong", "none", "null"):
        return None
    try:
        toks = _tokens(s)
        p = _Parser(toks)
        tree = p.parse_or()
        while p.peek() is not None:  # phần dư (ngoặc lệch) -> ghép VÀ
            p.take() if p.peek() in (")", "&", "|") else None
            rest = p.parse_or()
            tree = _combine("and", [tree, rest])
        return tree
    except Exception:  # noqa: BLE001
        codes = re.findall(r"[A-Za-z0-9_.\-]+", s)
        return _combine("and", [c.upper() for c in codes])


def tree_codes(tree: Tree | None) -> list[str]:
    if tree is None:
        return []
    if isinstance(tree, str):
        return [tree]
    out: list[str] = []
    for v in tree.values():
        for child in v:
            for c in tree_codes(child):
                if c not in out:
                    out.append(c)
    return out


def evaluate(tree: Tree | None, ok: Callable[[str], bool]) -> tuple[bool, list[dict]]:
    """Trả (thỏa?, missing). missing: [{code}] hoặc [{one_of:[...]}] cho nhánh HOẶC chưa thỏa."""
    if tree is None:
        return True, []
    if isinstance(tree, str):
        return (True, []) if ok(tree) else (False, [{"code": tree}])
    if "and" in tree:
        missing: list[dict] = []
        for child in tree["and"]:
            sat, miss = evaluate(child, ok)
            if not sat:
                missing.extend(miss)
        return not missing, missing
    if "or" in tree:
        options: list[dict] = []
        for child in tree["or"]:
            sat, miss = evaluate(child, ok)
            if sat:
                return True, []
            options.extend(miss)
        return False, [{"one_of": [m.get("code") for m in options if m.get("code")] or options}]
    return True, []


def find_cycles(edges: Iterable[tuple[str, str]]) -> list[list[str]]:
    """Tìm các chu trình trong đồ thị có hướng (source -> target). Trả mỗi chu trình một lần."""
    graph: dict[str, list[str]] = {}
    for a, b in edges:
        graph.setdefault(a, []).append(b)
        graph.setdefault(b, [])
    color: dict[str, int] = {n: 0 for n in graph}  # 0 chưa thăm, 1 đang thăm, 2 xong
    stack: list[str] = []
    cycles: list[list[str]] = []
    seen: set[frozenset] = set()

    def visit(n: str) -> None:
        color[n] = 1
        stack.append(n)
        for m in graph[n]:
            if color[m] == 0:
                visit(m)
            elif color[m] == 1:
                cyc = stack[stack.index(m):]
                key = frozenset(cyc)
                if key not in seen:
                    seen.add(key)
                    cycles.append(cyc + [m])
        stack.pop()
        color[n] = 2

    import sys

    sys.setrecursionlimit(max(sys.getrecursionlimit(), 10000))
    for n in sorted(graph):
        if color[n] == 0:
            visit(n)
    return cycles
