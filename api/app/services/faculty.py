"""Re-export faculty translation functions."""

from app.services.faculty_names import (
    department_en,
    department_vi,
    faculty_en,
    faculty_vi,
    fill_faculties,
    is_vietnamese,
)

__all__ = [
    "faculty_vi",
    "faculty_en",
    "department_vi",
    "department_en",
    "fill_faculties",
    "is_vietnamese",
]
