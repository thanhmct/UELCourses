"""Tests for Brief B7:
- Module detail endpoint returns outline_url (standard/Vietnamese) and outline_url_en (English),
  and deduplicated outline_links list without empty URLs.
- BKB4060-like case: entry with 2 links (standard + E) and an empty record -> outline_url, outline_url_en, no empty links.
- Module without outline -> outline_url is null, outline_url_en is null, outline_links is empty list.
- Indirect outline links via outline_module_links (catalog) pointing to outline document.
- List endpoint /api/modules also returns outline_url and outline_url_en.
"""

from app.models import (
    Module,
    OutlineDocument,
    OutlineModuleLink,
    OutlineResource,
    ProgramCatalogEntry,
)


def test_bkb4060_like_detail_outline_urls(client, db):
    """BKB4060: entry có link chuẩn tiếng Việt + link (E) tiếng Anh + bản ghi rỗng 'Phòng BĐCL rà soát đề cương'.
    Endpoint GET /api/modules/BKB4060 phải trả:
    - outline_url: link chuẩn tiếng Việt
    - outline_url_en: link bản (E) tiếng Anh
    - outline_links: danh sách 2 link, không có link rỗng, không trùng
    """
    db.add(
        Module(
            code="BKB4060",
            name="Luật sở hữu trí tuệ",
            credits=3,
            faculty="Khoa Luật",
            search_text="bkb4060 luat so huu tri tue",
        )
    )
    db.add(
        ProgramCatalogEntry(
            id="entry_bkb4060",
            program_label="Luật kinh doanh",
            module_code="BKB4060",
            module_name="Luật sở hữu trí tuệ",
            source_file="K25.xlsx",
            source_sheet="Sheet1",
            source_row=10,
        )
    )
    db.flush()

    std_url = "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing"
    en_url = "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing"

    db.add_all([
        OutlineResource(
            id="res_1",
            entry_id="entry_bkb4060",
            kind="Link đề cương hiện tại (chuẩn)",
            url=std_url,
        ),
        OutlineResource(
            id="res_2",
            entry_id="entry_bkb4060",
            kind="Link đề cương hiện tại (E)",
            url=en_url,
        ),
        OutlineResource(
            id="res_3",
            entry_id="entry_bkb4060",
            kind="Phòng BĐCL rà soát đề cương",
            url=None,  # bản ghi rỗng None
        ),
        OutlineResource(
            id="res_4",
            entry_id="entry_bkb4060",
            kind="Link rỗng chuỗi trống",
            url="",  # bản ghi chuỗi rỗng
        ),
        OutlineResource(
            id="res_5",
            entry_id="entry_bkb4060",
            kind="Link chỉ có khoảng trắng",
            url="   ",  # bản ghi khoảng trắng
        ),
    ])
    db.commit()

    r = client.get("/api/modules/BKB4060")
    assert r.status_code == 200
    data = r.json()

    assert data["code"] == "BKB4060"
    assert data["outline_url"] == std_url
    assert data["outline_url_en"] == en_url
    assert len(data["outline_links"]) == 2

    # Không có link rỗng
    urls_in_links = [item["url"] for item in data["outline_links"]]
    assert std_url in urls_in_links
    assert en_url in urls_in_links
    assert None not in urls_in_links
    assert "" not in urls_in_links


def test_module_without_outline_returns_null(client, db):
    """Module không có đề cương/link: outline_url null, outline_url_en null, outline_links rỗng."""
    db.add(
        Module(
            code="ABC9999",
            name="Môn học thử nghiệm chưa có đề cương",
            credits=2,
            search_text="abc9999 mon hoc thu nghiem",
        )
    )
    db.commit()

    r = client.get("/api/modules/ABC9999")
    assert r.status_code == 200
    data = r.json()

    assert data["code"] == "ABC9999"
    assert data["outline_url"] is None
    assert data["outline_url_en"] is None
    assert data["outline_links"] == []


def test_indirect_outline_links_via_outline_module_link(client, db):
    """Module không có entry trực tiếp nhưng có outline_module_links trỏ tới tài liệu đề cương:
    Tìm link qua cùng catalog entry của tài liệu đó (Requirement 2).
    """
    db.add(
        Module(
            code="XYZ8888",
            name="Môn liên kết qua tài liệu",
            credits=3,
            search_text="xyz8888 mon lien ket",
        )
    )
    # Entry không gắn trực tiếp module_code='XYZ8888' (vd để trống hoặc mang mã khác)
    db.add(
        ProgramCatalogEntry(
            id="entry_indirect_8888",
            program_label="Kinh tế",
            module_code=None,
            source_file="K25.xlsx",
            source_sheet="Sheet1",
            source_row=50,
        )
    )
    db.add(
        OutlineDocument(
            id=888,
            sha256="8" * 64,
            file_name="xyz8888.pdf",
            rel_path="outlines/xyz8888.pdf",
            size_bytes=1024,
        )
    )
    db.flush()

    std_url = "https://drive.google.com/file/d/xyz8888-vi/view"
    en_url = "https://drive.google.com/file/d/xyz8888-en/view"

    # OutlineResource gắn với entry và document
    db.add_all([
        OutlineResource(
            id="res_ind_1",
            entry_id="entry_indirect_8888",
            document_id=888,
            kind="Link đề cương hiện tại (chuẩn)",
            url=std_url,
        ),
        OutlineResource(
            id="res_ind_2",
            entry_id="entry_indirect_8888",
            kind="Link đề cương hiện tại (E)",
            url=en_url,
        ),
        OutlineModuleLink(
            document_id=888,
            module_code="XYZ8888",
            source="catalog",
        ),
    ])
    db.commit()

    r = client.get("/api/modules/XYZ8888")
    assert r.status_code == 200
    data = r.json()

    assert data["outline_url"] == std_url
    assert data["outline_url_en"] == en_url
    assert len(data["outline_links"]) == 2


def test_list_modules_includes_outline_url_and_outline_url_en(client, db):
    """Endpoint danh sách GET /api/modules cũng trả outline_url và outline_url_en."""
    db.add(
        Module(
            code="BKB4060",
            name="Luật sở hữu trí tuệ",
            credits=3,
            search_text="bkb4060 luat so huu tri tue",
        )
    )
    db.add(
        ProgramCatalogEntry(
            id="entry_bkb",
            program_label="Luật",
            module_code="BKB4060",
            source_file="K25.xlsx",
            source_sheet="Sheet1",
            source_row=12,
        )
    )
    db.flush()
    db.add_all([
        OutlineResource(
            id="res_bkb_1",
            entry_id="entry_bkb",
            kind="Link đề cương hiện tại",
            url="https://drive.google.com/file/d/vi-syllabus/view",
        ),
        OutlineResource(
            id="res_bkb_2",
            entry_id="entry_bkb",
            kind="Link đề cương hiện tại (E)",
            url="https://drive.google.com/file/d/en-syllabus/view",
        ),
    ])
    db.commit()

    r = client.get("/api/modules", params={"q": "BKB4060"})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    m = items[0]
    assert m["outline_url"] == "https://drive.google.com/file/d/vi-syllabus/view"
    assert m["outline_url_en"] == "https://drive.google.com/file/d/en-syllabus/view"
    assert len(m["outline_links"]) == 2


def test_duplicate_urls_are_deduplicated_in_outline_links(client, db):
    """Nếu nhiều bản ghi resource trỏ cùng một URL, outline_links chỉ giữ 1 bản ghi duy nhất."""
    db.add(
        Module(
            code="DUP1001",
            name="Môn trùng URL",
            credits=3,
            search_text="dup1001 mon trung url",
        )
    )
    db.add(
        ProgramCatalogEntry(
            id="entry_dup",
            program_label="Chung",
            module_code="DUP1001",
            source_file="K25.xlsx",
            source_sheet="Sheet1",
            source_row=20,
        )
    )
    db.flush()
    same_url = "https://drive.google.com/file/d/same-url/view"
    db.add_all([
        OutlineResource(
            id="res_dup_1",
            entry_id="entry_dup",
            kind="Link đề cương hiện tại",
            url=same_url,
        ),
        OutlineResource(
            id="res_dup_2",
            entry_id="entry_dup",
            kind="Link đề cương hiện tại (chuẩn)",
            url=same_url,  # trùng
        ),
    ])
    db.commit()

    r = client.get("/api/modules/DUP1001")
    assert r.status_code == 200
    data = r.json()
    assert data["outline_url"] == same_url
    assert len(data["outline_links"]) == 1


def test_outline_links_via_module_code_en(client, db):
    """Entry trong catalog ghi module_code_en thay vì module_code (ví dụ môn bản tiếng Anh).
    Endpoint GET /api/modules/{code} vẫn tìm thấy link đề cương.
    """
    db.add(
        Module(
            code="EKB4060",
            name="Intellectual Property Law (E)",
            credits=3,
            search_text="ekb4060 intellectual property law",
        )
    )
    db.add(
        ProgramCatalogEntry(
            id="entry_ekb4060",
            program_label="Chương trình Tiếng Anh",
            module_code=None,
            module_code_en="EKB4060",
            source_file="K25.xlsx",
            source_sheet="English",
            source_row=15,
        )
    )
    db.flush()
    en_url = "https://drive.google.com/file/d/ekb4060-en/view"
    db.add(
        OutlineResource(
            id="res_ekb_1",
            entry_id="entry_ekb4060",
            kind="Link đề cương hiện tại (E)",
            url=en_url,
        )
    )
    db.commit()

    r = client.get("/api/modules/EKB4060")
    assert r.status_code == 200
    data = r.json()
    assert data["outline_url"] == en_url
    assert data["outline_url_en"] == en_url
    assert len(data["outline_links"]) == 1
    assert data["outline_links"][0]["url"] == en_url
