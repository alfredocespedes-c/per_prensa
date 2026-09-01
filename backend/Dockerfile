# Build context: raíz del repo (necesita copiar db/schema.sql al mismo layout
# relativo que backend/app/db/bootstrap.py resuelve fuera de Docker, ver ese archivo).

# Python 3.11 slim como imagen base
FROM python:3.14-slim

# Directorio de trabajo en /app
WORKDIR /app

# Sin dependencias de sistema: psycopg2-binary trae su propio libpq precompilado
# (no necesita gcc/libpq-dev), y este backend no procesa PDFs ni imágenes.

# Copiar los requerimientos (están en backend/) e instalar
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# db/schema.sql es la única fuente de verdad del esquema (ver backend/app/db/bootstrap.py
# y collector/src/adaptadores/archivador-postgres.js) — se copia al mismo path relativo
# que se usa fuera de Docker.
COPY db/schema.sql ./db/schema.sql

# Copiar el backend a la estructura del contenedor
COPY backend/ ./backend/

# Posicionarnos en backend/ para un inicio limpio y en contexto (así "app.main:app"
# resuelve igual que en desarrollo local)
WORKDIR /app/backend

EXPOSE 8000

# Sin ports publicados al host en docker-compose.yml a propósito: solo el servicio
# "app" (nginx) necesita ser alcanzable desde afuera. nginx llega a este contenedor
# por la red interna de Docker (http://backend:8000) sin que este puerto esté expuesto.
#
# --workers 2, no más: <HOST_BD> es un servidor Postgres compartido que no
# administramos, no hace falta (ni conviene) exprimir throughput aquí.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
