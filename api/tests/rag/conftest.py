import sys
from datetime import date
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[2]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "regulations"
TODAY = date(2026, 11, 20)


@pytest.fixture(scope="session")
def fixture_dir() -> Path:
    return FIXTURE_DIR


@pytest.fixture(scope="session")
def today() -> date:
    return TODAY


@pytest.fixture(scope="session")
def built():
    from app.rag.pipeline import build_index

    return build_index(FIXTURE_DIR, today=TODAY)


@pytest.fixture(scope="session")
def index(built):
    return built[0]


@pytest.fixture()
def fresh_index():
    from app.rag.pipeline import build_index

    return build_index(FIXTURE_DIR, today=TODAY)[0]


def make_pdf(lines_per_page: list[list[str]]) -> bytes:
    """Minimal valid PDF (Helvetica, ASCII text) — empty list for a page = image-only/blank page."""
    objs: list[bytes] = []
    n_pages = len(lines_per_page)
    page_ids = [3 + 2 * i for i in range(n_pages)]
    font_id = 3 + 2 * n_pages
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in page_ids)}] /Count {n_pages} >>".encode())
    for i, lines in enumerate(lines_per_page):
        content = "BT /F1 11 Tf 14 TL 50 800 Td " + " ".join(
            "(" + ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") Tj T*" for ln in lines
        ) + " ET"
        cbytes = content.encode("latin-1")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {page_ids[i] + 1} 0 R "
                    f"/Resources << /Font << /F1 {font_id} 0 R >> >> >>".encode())
        objs.append(b"<< /Length " + str(len(cbytes)).encode() + b" >>\nstream\n" + cbytes + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for k, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{k} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)
