import uuid

from app.models import ClassSection, Lesson, Module, OutlineDocument, OutlineModuleLink, OutlineSection, Semester, Venue
from app.services.outline_email import get_module_lecturer_email


def test_outline_email_lookup(db):
    """Kiểm tra get_module_lecturer_email trích xuất đúng email từ OutlineSection."""
    m = Module(code="TESTEMAIL01", name="Môn kiểm thử email", credits=3)
    db.add(m)
    db.flush()

    doc = OutlineDocument(
        sha256=uuid.uuid4().hex,
        file_name="TESTEMAIL01.pdf",
        rel_path="outlines/TESTEMAIL01.pdf",
        size_bytes=1024,
        ctdt_year=2025,
    )
    db.add(doc)
    db.flush()

    link = OutlineModuleLink(document_id=doc.id, module_code="TESTEMAIL01", ctdt_year=2025)
    db.add(link)

    sec = OutlineSection(
        document_id=doc.id,
        kind="general",
        ord=1,
        heading="10. Giảng viên phụ trách môn học",
        text="ThS. Nguyễn Văn A - Email: gv_a@uel.edu.vn",
    )
    db.add(sec)
    db.commit()

    email = get_module_lecturer_email(db, "TESTEMAIL01")
    assert email == "gv_a@uel.edu.vn"


def test_api_module_and_classes_return_lecturer_email(client, db):
    """API GET /api/modules/{code} và GET /api/modules/{code}/classes trả trường lecturer_email."""
    sem = Semester(id="2026-2027-1", name="Học kỳ 1", year="2026-2027", term=1)
    db.add(sem)
    db.add(Venue(room="B1.406"))

    m = Module(code="TESTEMAIL02", name="Môn kiểm thử API email", credits=3, faculty="Khoa Kinh tế")
    db.add(m)
    db.flush()

    doc = OutlineDocument(
        sha256=uuid.uuid4().hex,
        file_name="TESTEMAIL02.pdf",
        rel_path="outlines/TESTEMAIL02.pdf",
        size_bytes=2048,
        ctdt_year=2025,
    )
    db.add(doc)
    db.flush()

    link = OutlineModuleLink(document_id=doc.id, module_code="TESTEMAIL02", ctdt_year=2025)
    db.add(link)

    sec = OutlineSection(
        document_id=doc.id,
        kind="general",
        ord=1,
        heading="Phụ trách môn học",
        text="Liên hệ: gv_b@uel.edu.vn",
    )
    db.add(sec)

    cs = ClassSection(
        class_code="261TESTEMAIL0201",
        module_code="TESTEMAIL02",
        semester_id="2026-2027-1",
        lecturer="TS. Lê Văn B",
    )
    db.add(cs)
    db.flush()

    les = Lesson(
        class_id=cs.id,
        weekday=2,
        start_period=1,
        end_period=3,
        start_time="07:00",
        end_time="09:35",
        room="B1.406",
    )
    db.add(les)
    db.commit()

    # Test /api/modules/TESTEMAIL02
    res = client.get("/api/modules/TESTEMAIL02")
    assert res.status_code == 200
    data = res.json()
    assert data["lecturer_email"] == "gv_b@uel.edu.vn"

    # Test /api/modules/TESTEMAIL02/classes
    res_cls = client.get("/api/modules/TESTEMAIL02/classes")
    assert res_cls.status_code == 200
    cls_list = res_cls.json()
    assert len(cls_list) == 1
    assert cls_list[0]["lecturer_email"] == "gv_b@uel.edu.vn"
    assert cls_list[0]["lecturer"] == "TS. Lê Văn B"
