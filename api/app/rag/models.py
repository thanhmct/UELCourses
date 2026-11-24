"""Core data structures for the regulations RAG pipeline (pure Python, no external deps)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any


def anchor_for(article: str | None, clause: str | None = None, point: str | None = None, part: int = 0) -> str | None:
    """Stable anchor / Obsidian block id: dieu-10, dieu-10-khoan-2, dieu-10-khoan-2-diem-a (đ -> dd)."""
    if not article:
        return None
    a = f"dieu-{str(article).lower()}".replace("đ", "dd")
    if part:
        a += f"-p{part}"
    if clause:
        a += f"-khoan-{clause}"
    if point:
        a += "-diem-" + str(point).lower().replace("đ", "dd")
    return a


def parse_date(value: Any) -> date | None:
    """Parse ISO (YYYY-MM-DD) or Vietnamese style (DD/MM/YYYY) dates; None if empty/invalid."""
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        pass
    for sep in ("/", "-", "."):
        parts = s.split(sep)
        if len(parts) == 3 and all(p.strip().isdigit() for p in parts):
            d, m, y = (int(p) for p in parts)
            try:
                return date(y, m, d)
            except ValueError:
                return None
    return None


@dataclass
class RegulationDoc:
    doc_id: str
    title: str
    decision_no: str = ""
    issued_date: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    status: str = "active"  # active | expired | superseded | upcoming
    superseded_by: str | None = None
    supersedes: list[str] = field(default_factory=list)
    applies_to_cohorts: list[str] = field(default_factory=lambda: ["all"])
    source_url: str | None = None
    file: str = ""
    catalog_status: str | None = None  # status as declared in catalog (if any)
    is_sample: bool = False
    issuer: str | None = None
    topics: list[str] = field(default_factory=list)
    verified: bool | None = None  # catalog metadata verified by a human?
    notes: str | None = None
    indexed: bool = False  # text was loaded and segmented
    # open-ended applicability "từ khóa X trở đi": also covers future cohorts not listed
    applies_from_cohort: str | None = None
    applies_from_source: str | None = None  # "catalog" | "text" | "chain"
    applies_until_cohort: str | None = None  # computed cap for the open-ended range
    amends: list[str] = field(default_factory=list)  # doc_ids this document amends (catalog)
    guides: list[str] = field(default_factory=list)  # doc_ids this document guides/implements (catalog)
    source_type: str = "regulation"  # regulation | handbook
    ocr_transcript: bool = False

    @property
    def metadata_unverified(self) -> bool:
        return self.verified is False or not self.decision_no

    def to_api(self) -> dict[str, Any]:
        """Shape defined by ARCHITECTURE.md (RegulationDoc) + a few optional extras."""
        return {
            "doc_id": self.doc_id,
            "title": self.title,
            "decision_no": self.decision_no,
            "issued_date": self.issued_date,
            "effective_from": self.effective_from,
            "effective_to": self.effective_to,
            "status": self.status,
            "superseded_by": self.superseded_by,
            "supersedes": list(self.supersedes),
            "applies_to_cohorts": list(self.applies_to_cohorts),
            "applies_from_cohort": self.applies_from_cohort,
            "source_url": self.source_url,
            "file": self.file,
            "is_sample": self.is_sample,
            "issuer": self.issuer,
            "topics": list(self.topics),
            "verified": self.verified,
            "metadata_verified": self.verified,
            "metadata_unverified": self.metadata_unverified,
            "indexed": self.indexed,
            "notes": self.notes,
            "source_type": self.source_type,
        }

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RegulationDoc":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class Point:
    point: str
    text: str
    page: int | None = None


@dataclass
class Clause:
    clause: str  # "1", "2", ... ; "" for article lead-in text
    text: str  # clause line (without the points)
    points: list[Point] = field(default_factory=list)
    page: int | None = None

    def full_text(self) -> str:
        parts = [self.text] if self.text else []
        parts += [p.text for p in self.points]
        return "\n".join(parts)


@dataclass
class Article:
    article: str
    title: str
    chapter: str | None = None
    section: str | None = None
    intro: str = ""  # text between "Điều N." line and first clause
    clauses: list[Clause] = field(default_factory=list)
    page: int | None = None
    part: int = 0  # >0 when article numbering restarts (e.g. decision wrapper + attached regulation)

    @property
    def key(self) -> str:
        return f"D{self.article}" + (f"p{self.part}" if self.part else "")

    def full_text(self) -> str:
        parts = [self.intro] if self.intro else []
        parts += [c.full_text() for c in self.clauses]
        return "\n".join(p for p in parts if p)

    def to_api(self) -> dict[str, Any]:
        return {
            "article": self.article,
            "part": self.part,
            "anchor": anchor_for(self.article, part=self.part),
            "title": self.title,
            "chapter": self.chapter,
            "section": self.section,
            "page": self.page,
            "intro": self.intro,
            "text": self.full_text(),
            "clauses": [
                {
                    "clause": c.clause,
                    "anchor": anchor_for(self.article, c.clause or None, part=self.part),
                    "text": c.text,
                    "points": [{"point": p.point, "text": p.text,
                                "anchor": anchor_for(self.article, c.clause or None, p.point, self.part)}
                               for p in c.points],
                }
                for c in self.clauses
            ],
        }


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str  # verbatim text of the clause (incl. points) or article
    decision_no: str = ""
    title: str = ""
    article: str | None = None
    article_title: str = ""
    clause: str | None = None
    point: str | None = None
    heading: str = ""
    chapter: str | None = None
    section: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    status: str = "active"
    applies_to_cohorts: list[str] = field(default_factory=list)
    page: int | None = None
    points: list[dict[str, str]] = field(default_factory=list)  # [{point, text}] inside clause
    part: int = 0
    source_type: str = "regulation"
    source_anchor: str | None = None
    chunk_type: str = "clause"  # clause | appendix
    window_part: int = 1  # 1-based retrieval window inside the source clause/appendix
    appendix_label: str | None = None

    def anchor(self, point: str | None = None) -> str | None:
        return self.source_anchor or anchor_for(self.article, self.clause, point, self.part)

    def index_text(self) -> str:
        """Text used for retrieval: heading (article title) + body."""
        heading = self.heading if self.source_type == "handbook" else self.article_title
        return f"{heading}\n{self.text}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Chunk":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})
