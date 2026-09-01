FROM python:3.12-slim
WORKDIR /app

COPY pyproject.toml .
COPY app ./app
# A slow connection otherwise fails the whole image on one read timeout partway through
# resolving dependencies, which is a miserable way to lose a fifteen-minute build.
RUN pip install --no-cache-dir --retries 10 --timeout 120 .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
