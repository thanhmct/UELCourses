# Container làm việc dùng chung cho mọi AI/lập trình viên: Python 3.14 + Node 24 + git + psql + OCR tiếng Việt.
# Mã nguồn được mount vào /workspace; venv và node_modules nằm trong named volume (không dùng bản Windows).
# Build context: ./docker (không gửi thư mục data/ nặng vào Docker).
FROM node:24-slim AS node

FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates postgresql-client poppler-utils tesseract-ocr tesseract-ocr-vie \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && python -m venv /opt/venv

WORKDIR /workspace
CMD ["sleep", "infinity"]
