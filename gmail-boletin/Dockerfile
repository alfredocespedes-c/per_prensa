# Python 3.13: el requisito es 3.11 o superior. slim y no alpine porque las ruedas
# precompiladas de las bibliotecas de Google son manylinux (glibc); en alpine (musl)
# habría que compilarlas.
FROM python:3.13-slim

# PYTHONUNBUFFERED es obligatorio en un contenedor: sin él, stdout se almacena en un
# búfer de bloque cuando no es una terminal y `docker compose up` no muestra NADA hasta
# que el proceso termina. Es la causa más común del "mi contenedor no imprime".
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Las dependencias, en su propia capa: el código cambia mucho más a menudo que
# requirements.txt, y así reconstruir no vuelve a descargarlas.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Usuario sin privilegios. Esta aplicación solo lee: no necesita root ni escribir en el
# sistema de archivos (por eso tampoco hay volumen para un token.json — no existe).
RUN useradd --create-home --uid 10001 lector
USER lector

# Ninguna credencial en la imagen: todas entran por entorno en tiempo de ejecución.
ENTRYPOINT ["python", "-m", "app"]
