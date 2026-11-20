from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import require_admin
from app.schemas import ImportResult
from app.services.ctdt_import import import_ctdt
from app.services.excel_import import import_ta_plan, import_uis_classes
from app.services.importer import (
    ImportFormatError,
    extract_rows,
    import_classes,
    import_equivalents,
    load_json_bytes,
)
from app.services.portal_timetable import import_portal_timetable

router = APIRouter(prefix="/import", tags=["import"], dependencies=[Depends(require_admin)])


async def _read_bytes(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File quá lớn (giới hạn {limit // (1024 * 1024)} MB).")
    return data


async def _read_json(file: UploadFile):
    try:
        return load_json_bytes(await _read_bytes(file))
    except ImportFormatError as e:
        raise HTTPException(422, str(e)) from None


def _run(fn, *args, **kwargs) -> ImportResult:
    try:
        return fn(*args, **kwargs)
    except ImportFormatError as e:
        raise HTTPException(422, str(e)) from None


@router.post("/classes", response_model=ImportResult,
             summary="Import lớp học phần (file JSON do fetch_courses.py sinh ra)")
async def import_classes_file(
    file: UploadFile = File(..., description="data/courses.json"),
    semester: str | None = Query(None, description="Ép mã học kỳ (vd 2026-2027-1); mặc định suy từ mã LHP/BeginDate"),
    db: Session = Depends(get_db),
):
    payload = await _read_json(file)
    return _run(lambda: import_classes(db, extract_rows(payload), semester=semester))


@router.post("/equivalents", response_model=ImportResult, summary="Import học phần tương đương (file JSON)")
async def import_equivalents_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = await _read_json(file)
    return _run(lambda: import_equivalents(db, extract_rows(payload)))


@router.post("/uis-classes", response_model=ImportResult,
             summary="Import lớp học phần từ file Excel UIS 'Danh sách thông tin LHP đăng ký' (.xlsx)")
async def import_uis_file(
    file: UploadFile = File(...),
    semester: str | None = Query(None, description="Ép mã học kỳ; mặc định suy từ tiền tố Mã LHP (251… = 2025-2026-1)"),
    db: Session = Depends(get_db),
):
    data = await _read_bytes(file)
    return _run(import_uis_classes, db, data, semester=semester, filename=file.filename)


@router.post("/ta-plan", response_model=ImportResult,
             summary="Import kế hoạch mở môn dạy bằng tiếng Anh 'Thông tin môn học TA' (.xlsx)")
async def import_ta_plan_file(
    file: UploadFile = File(...),
    academic_year: str | None = Query(None, description="vd 2026-2027; mặc định đọc từ tiêu đề/tên file"),
    db: Session = Depends(get_db),
):
    data = await _read_bytes(file)
    return _run(import_ta_plan, db, data, academic_year=academic_year, filename=file.filename)


@router.post("/ctdt", response_model=ImportResult,
             summary="Import chương trình đào tạo (ctdt_programs.json: {\"<StudyProgramID>\": [rows]})")
async def import_ctdt_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = await _read_json(file)
    return _run(import_ctdt, db, payload)


@router.post("/portal-timetable", response_model=ImportResult,
             summary="Import TKB xuất từ portal (DrawingSchedules_v2, JSON {sessions:[...]})")
async def import_portal_timetable_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = await _read_json(file)
    return _run(import_portal_timetable, db, payload)
