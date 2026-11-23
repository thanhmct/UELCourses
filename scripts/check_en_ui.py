"""Kiểm tra giao diện tiếng Anh: tìm chỗ còn tiếng Việt khi bật EN.

Ba loại lỗi:
  A. en.ts có giá trị chứa tiếng Việt (có dấu) → bản dịch chưa dịch.
  B. Khóa có ở vi.ts mà thiếu ở en.ts (hoặc ngược lại) → EN rơi về tiếng Việt / hiện khóa.
  C. Chuỗi tiếng Việt viết cứng trong mã nguồn web/src (không qua t(...)), bỏ qua chú thích, vi.ts, test, mock.
Ghi báo cáo: data/processed/en_ui_audit.md và en_ui_audit.json. Thoát mã 1 nếu còn lỗi (dùng làm kiểm tra tự động).

Dùng:  api\\.venv\\Scripts\\python.exe -X utf8 scripts\\check_en_ui.py [--quiet]
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web", "src")
OUT_MD = os.path.join(ROOT, "data", "processed", "en_ui_audit.md")
OUT_JSON = os.path.join(ROOT, "data", "processed", "en_ui_audit.json")
VI = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]")
# Từ tiếng Việt không dấu thường gặp (bắt thêm chuỗi viết cứng không dấu)
VI_PLAIN = re.compile(r"\b(Khong|khong|Hoc phan|Thoi khoa bieu|Tim kiem|Giang vien|Ke hoach)\b")
SKIP_DIRS = {"__tests__", "mocks", "node_modules", ".next"}
SKIP_FILES = {"vi.ts"}
KEY_RE = re.compile(r'^\s*"([^"]+)"\s*:\s*(.*?),?\s*$')


def load_dict(path):
    d = {}
    for i, line in enumerate(open(path, encoding="utf-8"), 1):
        m = KEY_RE.match(line)
        if m:
            d[m.group(1)] = (i, m.group(2))
    return d


def strip_comments(text):
    # giữ nguyên số dòng: thay chú thích bằng khoảng trắng cùng số dòng
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
    text = re.sub(r"(?m)(?<![:\"'`\\])//.*$", blank, text)
    return text


def main():
    quiet = "--quiet" in sys.argv
    vi = load_dict(os.path.join(SRC, "i18n", "vi.ts"))
    en = load_dict(os.path.join(SRC, "i18n", "en.ts"))
    A = [(k, ln, v) for k, (ln, v) in en.items() if VI.search(v)]
    B1 = sorted(k for k in vi if k not in en)
    B2 = sorted(k for k in en if k not in vi)
    C = []
    for dp, dns, fns in os.walk(SRC):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if not fn.endswith((".ts", ".tsx")) or fn in SKIP_FILES or fn.endswith(".d.ts"):
                continue
            p = os.path.join(dp, fn)
            rel = os.path.relpath(p, ROOT).replace("\\", "/")
            if rel.endswith("i18n/en.ts"):
                continue
            text = strip_comments(open(p, encoding="utf-8").read())
            for i, line in enumerate(text.splitlines(), 1):
                if not (VI.search(line) or VI_PLAIN.search(line)):
                    continue
                # chỉ lấy các chuỗi/ văn bản JSX có tiếng Việt
                found = re.findall(r"""(["'`])((?:\\.|(?!\1).)*?)\1""", line)
                segs = [s for _, s in found if VI.search(s) or VI_PLAIN.search(s)]
                segs += [t for t in re.findall(r">([^<>{}]*)<", line) if VI.search(t) or VI_PLAIN.search(t)]
                for s in segs:
                    C.append((rel, i, s.strip()[:120]))
    res = {"A_en_value_vietnamese": A, "B_missing_in_en": B1, "B_missing_in_vi": B2, "C_hardcoded_vietnamese": C}
    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    json.dump(res, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    lines = ["# Kiểm tra giao diện tiếng Anh", "",
             f"- A. Giá trị en.ts còn tiếng Việt: **{len(A)}**",
             f"- B. Khóa thiếu trong en.ts: **{len(B1)}**; khóa thừa (không có ở vi.ts): **{len(B2)}**",
             f"- C. Chuỗi tiếng Việt viết cứng trong mã: **{len(C)}** (ở {len({c[0] for c in C})} file)", ""]
    lines += ["## A. en.ts còn tiếng Việt", ""] + [f"- `{k}` (en.ts:{ln}) {v[:100]}" for k, ln, v in A]
    lines += ["", "## B. Khóa thiếu trong en.ts", ""] + [f"- `{k}` = {vi[k][1][:80]}" for k in B1]
    lines += ["", "## B'. Khóa có ở en.ts nhưng không có ở vi.ts", ""] + [f"- `{k}`" for k in B2]
    lines += ["", "## C. Chuỗi tiếng Việt viết cứng", ""] + [f"- {f}:{ln}: {s}" for f, ln, s in C]
    open(OUT_MD, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    if not quiet:
        print("\n".join(lines[:6]))
        print("báo cáo:", OUT_MD)
    return 1 if (A or B1 or C) else 0


if __name__ == "__main__":
    sys.exit(main())
