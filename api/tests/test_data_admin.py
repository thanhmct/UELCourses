"""Test quản trị dữ liệu học phần (khoa/bộ môn) và độ phủ đề cương (Brief A4, D-A7)."""

from __future__ import annotations

from datetime import datetime, timezone
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import (
    AuditLog,
    ClassSection,
    Module,
    OutlineCourse,
    OutlineDocument,
    OutlineModuleLink,
    OutlineResource,
    Program,
    ProgramCatalogEntry,
    ProgramModule,
    Semester,
)
from app.services.faculty_admin import invalidate_audit_cache
from app.services.faculty_names import (
    apply_outline_faculties,
    fix_module_faculties,
)


def _setup_admin_env(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "env", "development")
    monkeypatch.setattr(settings, "admin_dev_open", True)
    invalidate_audit_cache()


def test_patch_module_faculty_records_admin_source_and_audit(client, monkeypatch, db):
    """PATCH /api/admin/modules/{code} ghi nguồn 'admin' và lưu nhật ký AuditLog."""
    _setup_admin_env(monkeypatch)

    m = Module(
        code="BIM9001",
        name="Hệ thống cơ sở dữ liệu nâng cao",
        faculty=None,
        department=None,
        credits=3,
    )
    db.add(m)
    db.commit()

    # 1. Kiểm tra từ chối khoa không hợp lệ (422)
    res_bad = client.patch(
        "/api/admin/modules/BIM9001",
        json={"faculty": "Khoa Không Tồn Tại", "department": "Bộ môn Test"},
    )
    assert res_bad.status_code == 422
    assert "Khoa 'Khoa Không Tồn Tại' không hợp lệ" in res_bad.json()["detail"]

    # 2. Cập nhật thành công với khoa chuẩn
    res_ok = client.patch(
        "/api/admin/modules/BIM9001",
        json={
            "faculty": "Khoa Hệ thống thông tin",
            "department": "Bộ môn Hệ thống thông tin quản lý",
        },
    )
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert data["faculty"] == "Khoa Hệ thống thông tin"
    assert data["department"] == "Bộ môn Hệ thống thông tin quản lý"
    assert data["faculty_source"] == "admin"
    assert data["faculty_set_by"] == "dev@uelcourses.local"

    # Kiểm tra trực tiếp DB
    db.refresh(m)
    assert m.faculty == "Khoa Hệ thống thông tin"
    assert m.department == "Bộ môn Hệ thống thông tin quản lý"
    assert m.faculty_source == "admin"
    assert m.faculty_set_by == "dev@uelcourses.local"
    assert m.faculty_set_at is not None
    assert "khoa he thong thong tin" in m.search_text

    # Kiểm tra AuditLog
    audit = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == "BIM9001",
            AuditLog.action == "update_module_faculty",
        )
    )
    assert audit is not None
    assert audit.before["faculty"] is None
    assert audit.after["faculty"] == "Khoa Hệ thống thông tin"
    assert audit.after["faculty_source"] == "admin"


def test_fix_module_faculty_does_not_overwrite_admin(monkeypatch, db):
    """Quy trình tự động apply_outline_faculties / fix_module_faculties KHÔNG ghi đè môn có faculty_source='admin'."""
    _setup_admin_env(monkeypatch)

    # Tạo học phần đã được admin đặt thủ công
    m = Module(
        code="BBB9002",
        name="Quản trị học đặc biệt",
        faculty="Khoa Kinh tế",  # Khác với đề cương hoặc tiền tố BB
        department="Bộ môn Quản lý công",
        faculty_source="admin",
        faculty_set_by="admin@uelcourses.local",
        faculty_set_at=datetime.now(timezone.utc),
        credits=3,
    )
    db.add(m)
    db.commit()

    # Thêm đề cương nói môn này thuộc Khoa Quản trị kinh doanh
    doc = OutlineDocument(
        file_name="BBB9002.pdf",
        rel_path="BBB9002.pdf",
        sha256="hash_bbb9002",
        size_bytes=1000,
        text_status="extracted",
    )
    db.add(doc)
    db.flush()

    db.add(
        OutlineCourse(
            document_id=doc.id,
            course_code="BBB9002",
            course_code_norm="BBB9002",
            faculty="Khoa Quản trị kinh doanh",
            department="Bộ môn Quản trị",
            parse_status="ok",
        )
    )
    db.commit()

    # Chạy lệnh fix_module_faculties
    summary = fix_module_faculties(db, dry_run=False)

    # Đảm bảo môn nguồn admin được thống kê và KHÔNG bị đổi
    assert summary.get("from_admin", 0) >= 1

    db.refresh(m)
    assert m.faculty == "Khoa Kinh tế"  # Vẫn giữ nguyên khoa do admin đặt
    assert m.department == "Bộ môn Quản lý công"
    assert m.faculty_source == "admin"


def test_bulk_faculty_review_accept_and_set(client, monkeypatch, db):
    """POST /api/admin/data/faculty-review/bulk: nhận đề xuất và đặt khoa hàng loạt."""
    _setup_admin_env(monkeypatch)

    m1 = Module(code="EAA9003", name="Kế toán tài chính", faculty=None, credits=3)
    m2 = Module(code="EAA9004", name="Kiểm toán nâng cao", faculty=None, credits=3)
    db.add_all([m1, m2])
    db.commit()

    # 1. Thao tác 'set' hàng loạt
    res_set = client.post(
        "/api/admin/data/faculty-review/bulk",
        json={
            "codes": ["EAA9003", "EAA9004"],
            "action": "set",
            "faculty": "Khoa Kế toán - Kiểm toán",
            "department": "Bộ môn Kế toán",
        },
    )
    assert res_set.status_code == 200
    assert res_set.json()["updated_count"] == 2

    db.refresh(m1)
    db.refresh(m2)
    assert m1.faculty == "Khoa Kế toán - Kiểm toán"
    assert m1.faculty_source == "admin"
    assert m2.faculty == "Khoa Kế toán - Kiểm toán"
    assert m2.faculty_source == "admin"

    # Kiểm tra audit_log bulk
    audits = db.scalars(
        select(AuditLog).where(AuditLog.action == "bulk_set_module_faculty")
    ).all()
    assert len(audits) >= 2


def test_delete_faculty_override_recalculates_auto(client, monkeypatch, db):
    """DELETE /api/admin/modules/{code}/faculty-override: xóa ghi đè admin và tính lại khoa tự động."""
    _setup_admin_env(monkeypatch)

    # Môn có tiền tố BB -> tự động là Khoa Quản trị kinh doanh
    m = Module(
        code="BBB9005",
        name="Kinh doanh quốc tế căn bản",
        faculty="Khoa Luật",  # Admin ghi đè trước đó
        faculty_source="admin",
        credits=3,
    )
    db.add(m)
    db.commit()

    res = client.delete("/api/admin/modules/BBB9005/faculty-override")
    assert res.status_code == 200
    data = res.json()
    assert data["code"] == "BBB9005"
    assert data["faculty"] == "Khoa Quản trị kinh doanh"  # Đã tính lại theo tiền tố BB
    assert data["faculty_source"] is None  # Đã hủy ghi đè admin

    db.refresh(m)
    assert m.faculty == "Khoa Quản trị kinh doanh"
    assert m.faculty_source is None

    # Kiểm tra audit_log
    audit = db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == "BBB9005",
            AuditLog.action == "delete_module_faculty_override",
        )
    )
    assert audit is not None


def test_role_permissions_moderator_gets_403(client, monkeypatch):
    """Người dùng có vai trò 'moderator' bị từ chối 403 Forbidden khi truy cập dữ liệu học phần/đề cương."""
    _setup_admin_env(monkeypatch)
    headers = {"x-admin-role": "moderator"}

    # 1. /api/admin/data/faculty-review
    res1 = client.get("/api/admin/data/faculty-review", headers=headers)
    assert res1.status_code == 403

    # 2. PATCH /api/admin/modules/{code}
    res2 = client.patch(
        "/api/admin/modules/BIM5001",
        json={"faculty": "Khoa Hệ thống thông tin"},
        headers=headers,
    )
    assert res2.status_code == 403

    # 3. /api/admin/outlines/coverage
    res3 = client.get("/api/admin/outlines/coverage", headers=headers)
    assert res3.status_code == 403

    # 4. /api/admin/faculties
    res4 = client.get("/api/admin/faculties", headers=headers)
    assert res4.status_code == 403


def test_outlines_coverage_and_missing_endpoints(client, monkeypatch, db):
    """Kiểm tra tính toán số liệu độ phủ đề cương và danh sách môn thiếu."""
    _setup_admin_env(monkeypatch)

    # 1. Thêm học kỳ và học phần
    sem = Semester(
        id="2026-2027-1",
        name="Học kỳ 1 năm học 2026-2027",
        year="2026-2027",
        term=1,
        is_current_override=True,
    )
    db.add(sem)

    m1 = Module(
        code="LAW9001",
        name="Pháp luật đại cương",
        faculty="Khoa Luật",
        counterpart_code="ELAW9001",
        credits=3,
    )
    m2 = Module(
        code="LAW9002",
        name="Luật thương mại",
        faculty="Khoa Luật",
        credits=3,
    )
    m3 = Module(
        code="ELAW9001",
        name="General Law",
        faculty="Khoa Luật",
        counterpart_code="LAW9001",
        credits=3,
    )
    db.add_all([m1, m2, m3])
    db.commit()

    # Thêm lớp học cho m2 (2 lớp) và m1 (1 lớp)
    c1 = ClassSection(class_code="CLASS_LAW_1", module_code="LAW9002", semester_id="2026-2027-1")
    c2 = ClassSection(class_code="CLASS_LAW_2", module_code="LAW9002", semester_id="2026-2027-1")
    c3 = ClassSection(class_code="CLASS_LAW_3", module_code="LAW9001", semester_id="2026-2027-1")
    db.add_all([c1, c2, c3])

    # Gắn đề cương cho ELAW9001
    doc = OutlineDocument(
        file_name="ELAW9001.pdf",
        rel_path="ELAW9001.pdf",
        sha256="hash_elaw9001",
        size_bytes=2048,
        text_status="extracted",
    )
    db.add(doc)
    db.flush()

    db.add(OutlineModuleLink(document_id=doc.id, module_code="ELAW9001"))
    db.commit()

    # Test /api/admin/outlines/coverage
    res_cov = client.get("/api/admin/outlines/coverage")
    assert res_cov.status_code == 200
    cov_data = res_cov.json()
    assert cov_data["total_modules"] >= 3
    assert cov_data["modules_with_outline"] >= 1
    assert "by_faculty" in cov_data
    assert "by_semester" in cov_data

    # Test /api/admin/outlines/missing
    res_mis = client.get("/api/admin/outlines/missing?sort=open_classes")
    assert res_mis.status_code == 200
    mis_data = res_mis.json()
    codes = [item["code"] for item in mis_data["items"]]
    assert "LAW9002" in codes
    assert "LAW9001" in codes
    assert "ELAW9001" not in codes  # ELAW9001 đã có đề cương

    # Môn LAW9002 có 2 lớp phải đứng trước LAW9001 (1 lớp)
    idx_m2 = codes.index("LAW9002")
    idx_m1 = codes.index("LAW9001")
    assert idx_m2 < idx_m1

    # Kiểm tra LAW9001 phát hiện bản tương ứng ELAW9001 đã có đề cương
    law1_item = next(item for item in mis_data["items"] if item["code"] == "LAW9001")
    assert law1_item["counterpart_code"] == "ELAW9001"
    assert law1_item["counterpart_has_outline"] is True


def test_outlines_ocr_pending_and_drive_links(client, monkeypatch, db):
    """GET /api/admin/outlines/ocr-pending và /drive-links chỉ liệt kê danh sách mà không tải."""
    _setup_admin_env(monkeypatch)

    doc_ocr = OutlineDocument(
        file_name="scan_syllabus_pending.pdf",
        rel_path="scans/pending.pdf",
        sha256="hash_ocr_pending",
        size_bytes=4096,
        page_count=8,
        ocr_status="pending",
        ocr_engine="tesseract vie+eng",
    )
    db.add(doc_ocr)

    cat_entry = ProgramCatalogEntry(
        id="CAT_001",
        program_label="Hệ thống thông tin",
        module_code="BIM5001",
        module_name="Cơ sở dữ liệu",
        source_file="catalog.xlsx",
        source_sheet="Dữ liệu gốc",
        source_row=1,
    )
    db.add(cat_entry)
    db.flush()

    res_drive = OutlineResource(
        id="RES_DRIVE_01",
        entry_id="CAT_001",
        kind="Link đề cương hiện tại",
        label="Đề cương Google Docs",
        url="https://docs.google.com/document/d/12345/edit",
        status="no_url",
    )
    db.add(res_drive)
    db.commit()

    # 1. Test OCR pending
    res_ocr = client.get("/api/admin/outlines/ocr-pending")
    assert res_ocr.status_code == 200
    ocr_items = res_ocr.json()["items"]
    assert any(d["file_name"] == "scan_syllabus_pending.pdf" for d in ocr_items)

    # 2. Test Drive links
    res_dl = client.get("/api/admin/outlines/drive-links")
    assert res_dl.status_code == 200
    dl_items = res_dl.json()["items"]
    found_drive = next((d for d in dl_items if d["id"] == "RES_DRIVE_01"), None)
    assert found_drive is not None
    assert "https://docs.google.com" in found_drive["url"]
    assert "BIM5001" in found_drive["module_codes"]


def test_get_faculties_endpoint(client, monkeypatch):
    """GET /api/admin/faculties trả về 9 khoa chuẩn và 2 phòng."""
    _setup_admin_env(monkeypatch)

    res = client.get("/api/admin/faculties")
    assert res.status_code == 200
    data = res.json()
    assert len(data["canonical_faculties"]) == 11
    assert "Khoa Quản trị kinh doanh" in data["canonical_faculties"]
    assert "Phòng Đào tạo" in data["canonical_faculties"]
    assert "Phòng Bảo đảm chất lượng" in data["canonical_faculties"]
    assert [item["name"] for item in data["faculties"]] == data["canonical_faculties"]
