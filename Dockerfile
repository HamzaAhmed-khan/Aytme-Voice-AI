# Base stage for dependencies
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
    curl \
    build-essential \
    ffmpeg \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# API stage (Inherits from base)
# This includes the API code and Migrations code
FROM base AS api
COPY services/api ./app
COPY services/billing ./services/billing
COPY services/media_worker ./services/media_worker
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
EXPOSE 8000
# (CMD is overridden in spec, but provided here as default)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Worker stage (Inherits from api)
# This includes everything in api + the worker code
# This is the LAST stage, so DigitalOcean defaults to this "fat" image
FROM api AS worker
CMD ["python", "-m", "services.media_worker.main"]
