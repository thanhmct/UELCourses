# Backend FastAPI (+ RAG). Build context: ./api
FROM python:3.14-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Cài thư viện production trước để tận dụng cache layer
COPY requirements.txt requirements-rag.txt* ./
RUN pip install -r requirements.txt \
 && if [ -f requirements-rag.txt ]; then pip install -r requirements-rag.txt || echo "WARN: requirements-rag.txt không cài đủ (bỏ qua thư viện tùy chọn)"; fi

COPY . .

RUN useradd --create-home --uid 1000 app && mkdir -p /app/data && chown -R app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
