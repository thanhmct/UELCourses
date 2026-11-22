#!/bin/sh
# Lệnh khởi động API trên Render (Docker). Tách ra file riêng vì chuỗi nhiều lệnh
# đặt thẳng trong dockerCommand của render.yaml bị shell hiểu sai (exit 127).
set -e

echo "[start] chay migration Alembic..."
alembic upgrade head

echo "[start] khoi dong uvicorn tren cong ${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers
