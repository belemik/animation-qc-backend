FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# зависимости для OpenCV / видео
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# копируем проект
COPY . /app

# создаем папки (на всякий)
RUN mkdir -p /app/uploads /app/previews /app/annotations /app/exports

ENV FRONTEND_DIR=/app/frontend
ENV UPLOADS_DIR=/app/uploads
ENV PREVIEWS_DIR=/app/previews
ENV ANNOTATIONS_DIR=/app/annotations
ENV EXPORTS_DIR=/app/exports
ENV ALLOWED_ORIGINS=*

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]