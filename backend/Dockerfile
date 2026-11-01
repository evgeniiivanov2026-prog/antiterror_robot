FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini alembic.ini
COPY alembic alembic
COPY app app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /var/lib/antiterror/evidence \
    && chown -R appuser:appuser /app /var/lib/antiterror
USER appuser

EXPOSE 8000
ENTRYPOINT ["/docker-entrypoint.sh"]
