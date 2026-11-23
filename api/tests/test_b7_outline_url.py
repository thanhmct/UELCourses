"""Tests for Brief B7:
Trang chi tiết học phần trả link PDF đề cương (BKB4060):
- BKB4060-like: entry có link chuẩn + link (E), bản ghi rỗng "Phòng BĐCL rà soát đề cương"
  -> outline_url chuẩn, outline_url_en bản E, không có link rỗng trong outline_links.
- Module không có link -> outline_url is None, outline_url_en is None, outline_links == [].
- Module tìm gián tiếp qua outline_module_links (nguồn catalog) trỏ tới tài liệu đề cương.
"""

from app.models import Module, OutlineDocument, OutlineModuleLink, OutlineResource, ProgramCatalogEntry


def test_bkb4060_outline_url_in_detail_and_list(client, db):
    # 1. Tạo module BKB4060 và module không có link MOD_NOLINK
    bkb = Module(
        code="BKB4060",
        name="Luật sở hữu trí tuệ",
        credits=3,
        faculty="Khoa Luật",
        search_text="bkb4060 luat so huu tri tue",
    )
    no_link = Module(
        code="MOD_NOLINK",
        name="Học phần không có đề cương",
        credits=3,
        faculty="Khoa Kinh tế",
        search_text="mod_nolink hoc phan khong co de cuong",
    )
    db.add_all([bkb, no_link])

    # 2. Tạo ProgramCatalogEntry cho BKB4060
    cat_entry = ProgramCatalogEntry(
        id="cat_bkb4060",
        module_code="BKB4060",
        program_label="K25 Luật",
        source_file="CTDT_Luat_2025.xlsx",
        source_sheet="Chuan",
        source_row=10,
    )
    db.add(cat_entry)
    db.flush()

    # 3. Tạo các OutlineResource cho BKB4060:
    # - 1 link chuẩn tiếng Việt
    # - 1 link bản (E)
    # - các bản ghi rỗng "Phòng BĐCL rà soát đề cương" (None, rỗng, khoảng trắng)
    url_vi = "https://drive.google.com/file/d/1DUmavTFNn-Hh3VC2TDY2pDo18VKnaPMF/view?usp=sharing"
    url_en = "https://drive.google.com/file/d/1aJ0fWojSP3_np7ZgAouLXMJnvm6unRPR/view?usp=sharing"

    r_vi = OutlineResource(
        id="res_bkb_vi",
        entry_id="cat_bkb4060",
        kind="Link đề cương hiện tại (chuẩn)",
        url=url_vi,
    )
    r_en = OutlineResource(
        id="res_bkb_en",
        entry_id="cat_bkb4060",
        kind="Link đề cương hiện tại (E)",
        url=url_en,
    )
    r_empty1 = OutlineResource(
        id="res_bkb_empty1",
        entry_id="cat_bkb4060",
        kind="Phòng BĐCL rà soát đề cương",
        url=None,
    )
    r_empty2 = OutlineResource(
        id="res_bkb_empty2",
        entry_id="cat_bkb4060",
        kind="Phòng BĐCL rà soát đề cương",
        url="",
    )
    r_empty3 = OutlineResource(
        id="res_bkb_empty3",
        entry_id="cat_bkb4060",
        kind="Phòng BĐCL rà soát đề cương",
        url="   ",
    )
    db.add_all([r_vi, r_en, r_empty1, r_empty2, r_empty3])
    db.commit()

    # Kiểm tra endpoint chi tiết GET /api/modules/BKB4060
    r_det = client.get("/api/modules/BKB4060")
    assert r_det.status_code == 200
    data = r_det.json()
    assert data["code"] == "BKB4060"
    assert data["outline_url"] == url_vi
    assert data["outline_url_en"] == url_en
    assert "outline_links" in data

    links = data["outline_links"]
    assert len(links) == 2
    urls = [it["url"] for it in links]
    assert url_vi in urls
    assert url_en in urls
    # Đảm bảo không có link rỗng hay kind rà soát đề cương rỗng
    for it in links:
        assert it["url"].startswith("http")
        assert it["kind"] != "Phòng BĐCL rà soát đề cương"

    # Kiểm tra endpoint chi tiết GET /api/modules/MOD_NOLINK
    r_nolink = client.get("/api/modules/MOD_NOLINK")
    assert r_nolink.status_code == 200
    data_nolink = r_nolink.json()
    assert data_nolink["outline_url"] is None
    assert data_nolink["outline_url_en"] is None
    assert data_nolink["outline_links"] == []

    # Kiểm tra endpoint danh sách GET /api/modules
    r_list = client.get("/api/modules")
    assert r_list.status_code == 200
    items = r_list.json()["items"]
    items_by_code = {m["code"]: m for m in items}

    bkb_item = items_by_code["BKB4060"]
    assert bkb_item["outline_url"] == url_vi
    assert bkb_item["outline_url_en"] == url_en
    assert len(bkb_item["outline_links"]) == 2

    nolink_item = items_by_code["MOD_NOLINK"]
    assert nolink_item["outline_url"] is None
    assert nolink_item["outline_url_en"] is None
    assert nolink_item["outline_links"] == []


def test_indirect_outline_url_via_outline_module_links(client, db):
    # Module không có entry trực tiếp trong program_catalog_entries.module_code
    mod = Module(
        code="INDIR001",
        name="Phân tích dữ liệu kinh doanh",
        credits=3,
        faculty="Khoa Hệ thống thông tin",
        search_text="indir001 phan tich du lieu kinh doanh",
    )
    db.add(mod)

    # Document và Catalog entry của tài liệu
    doc = OutlineDocument(
        id=701,
        sha256="7" * 64,
        file_name="701_outline.pdf",
        rel_path="outlines/701_outline.pdf",
        size_bytes=2048,
    )
    db.add(doc)

    cat_entry = ProgramCatalogEntry(
        id="cat_indirect_701",
        module_code=None,  # ô mã trống trong catalog
        program_label="K25 HTTT",
        source_file="CTDT_HTTT_2025.xlsx",
        source_sheet="Chuan",
        source_row=15,
    )
    db.add(cat_entry)
    db.flush()

    # Tài nguyên đề cương gắn với catalog entry và document
    url_vi = "https://drive.google.com/file/d/indir_vi/view"
    url_en = "https://drive.google.com/file/d/indir_en/view"

    r1 = OutlineResource(
        id="res_ind_vi",
        entry_id="cat_indirect_701",
        document_id=701,
        kind="Link đề cương hiện tại (chuẩn)",
        url=url_vi,
    )
    r2 = OutlineResource(
        id="res_ind_en",
        entry_id="cat_indirect_701",
        document_id=None,
        kind="Link đề cương hiện tại (E)",
        url=url_en,
    )
    db.add_all([r1, r2])

    # OutlineModuleLink (nguồn catalog) kết nối INDIR001 với document 701
    link = OutlineModuleLink(
        document_id=701,
        module_code="INDIR001",
        source="catalog",
    )
    db.add(link)
    db.commit()

    # Gọi API chi tiết của INDIR001
    r = client.get("/api/modules/INDIR001")
    assert r.status_code == 200
    data = r.json()
    assert data["code"] == "INDIR001"
    assert data["outline_url"] == url_vi
    assert data["outline_url_en"] == url_en
    assert len(data["outline_links"]) == 2
