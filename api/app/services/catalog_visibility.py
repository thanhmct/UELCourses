from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, Program, ProgramModule


def visible_module(code_column):
    """Apply catalog visibility to relations that store a module code."""
    return code_column.not_in(select(Module.code).where(Module.is_hidden.is_(True)))


def public_module(db: Session, code: str) -> Module:
    module = db.get(Module, code.strip().upper())
    if module is None or module.is_hidden:
        raise HTTPException(404, f"Không tìm thấy học phần {code}.")
    return module


def visible_program_modules(program: Program) -> list[ProgramModule]:
    return [row for row in program.modules if row.module is None or not row.module.is_hidden]
