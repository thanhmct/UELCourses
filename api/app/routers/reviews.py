from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Review, User
from app.rate_limit import get_real_ip
from app.routers.auth import require_active_user
from app.services.catalog_visibility import public_module
from app.services.ip_utils import hash_client_ip
from app.services.moderation import GUIDELINES_VI, moderate
from app.services.moderation_ban import apply_autoban_if_needed
from app.services.nickname import public_name, validate_nickname

router = APIRouter(tags=["reviews"])


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5, description="Đánh giá chung, 1–5 sao")
    difficulty: int | None = Field(default=None, ge=1, le=5, description="Độ khó: 1 rất dễ … 5 rất khó")
    workload: int | None = Field(default=None, ge=1, le=5, description="Khối lượng bài tập/thi: 1 nhẹ … 5 nặng")
    semester: str | None = Field(default=None, max_length=32, description="Học kỳ đã học, vd 2025-2026-1")
    professor: str | None = Field(default=None, max_length=256, description="Giảng viên phụ trách (tùy chọn)")
    display_name: str | None = Field(
        default=None, max_length=64,
        description="Tên hiển thị riêng cho bài này (tùy chọn). Trống: dùng biệt danh tài khoản, nếu chưa có thì ẩn danh",
    )
    content: str = Field(min_length=20, max_length=2000, description="Nội dung đánh giá và lời khuyên")


class ReviewOut(BaseModel):
    id: int
    display_name: str
    semester: str | None = None
    professor: str | None = None
    rating: int
    difficulty: int | None = None
    workload: int | None = None
    content: str
    created_at: str


class ReviewSummary(BaseModel):
    count: int
    avg_rating: float | None = None
    avg_difficulty: float | None = None
    avg_workload: float | None = None


class ReviewList(BaseModel):
    items: list[ReviewOut]
    summary: ReviewSummary
    page: int
    size: int
    total: int


@router.get("/reviews/guidelines", summary="Nguyên tắc cộng đồng khi viết đánh giá")
def guidelines():
    return {"items": GUIDELINES_VI}


@router.get("/modules/{code}/reviews", response_model=ReviewList, summary="Đánh giá đã duyệt của học phần (công khai)")
def list_reviews(code: str, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    mcode = public_module(db, code).code
    base = select(Review).where(Review.module_code == mcode, Review.status == "approved")
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = list(db.scalars(base.order_by(Review.created_at.desc()).offset((page - 1) * size).limit(size)))
    agg = db.execute(select(func.count(), func.avg(Review.rating), func.avg(Review.difficulty), func.avg(Review.workload))
                     .where(Review.module_code == mcode, Review.status == "approved")).one()

    def r1(v):
        return None if v is None else round(float(v), 1)

    return ReviewList(
        items=[ReviewOut(id=r.id, display_name=r.display_name, semester=r.semester, professor=r.professor, rating=r.rating,
                         difficulty=r.difficulty, workload=r.workload, content=r.content, created_at=r.created_at.isoformat())
               for r in rows],
        summary=ReviewSummary(count=agg[0] or 0, avg_rating=r1(agg[1]), avg_difficulty=r1(agg[2]), avg_workload=r1(agg[3])),
        page=page, size=size, total=total,
    )


@router.post("/modules/{code}/reviews", status_code=201, summary="Viết đánh giá học phần (cần đăng nhập)")
def create_review(
    code: str,
    body: ReviewIn,
    request: Request,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    mcode = public_module(db, code).code
    if db.scalar(select(Review.id).where(Review.module_code == mcode, Review.user_id == user.id).limit(1)):
        raise HTTPException(409, "Bạn đã đánh giá học phần này. Liên hệ quản trị viên nếu cần sửa.")
    ip_hash = hash_client_ip(get_real_ip(request))
    res = moderate(body.content + " " + (body.professor or ""), db=db)
    # Tên riêng cho bài này (nếu nhập) > biệt danh của tài khoản > "Sinh viên ẩn danh". Không bao giờ dùng tên thật từ Google/Facebook.
    shown_name = public_name(validate_nickname(body.display_name, db) or user.nickname)
    review = Review(
        module_code=mcode, user_id=user.id,
        display_name=shown_name,
        semester=body.semester, professor=body.professor, rating=body.rating, difficulty=body.difficulty,
        workload=body.workload, content=body.content.strip(), status=res.status,
        moderation_reasons=res.reasons or None,
        ip_hash=ip_hash,
    )
    db.add(review)
    db.commit()
    if res.status == "pending":
        apply_autoban_if_needed(db, user, ip_hash, res.reasons)
        db.commit()
    if res.status == "approved":
        msg = "Cảm ơn bạn! Đánh giá đã được đăng."
    else:
        msg = "Đánh giá của bạn đang chờ duyệt vì có nội dung cần kiểm tra lại theo nguyên tắc cộng đồng."
    return {"id": review.id, "status": review.status, "message": msg}
