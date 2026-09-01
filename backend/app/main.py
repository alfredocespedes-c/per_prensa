import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from . import config
from .db import bootstrap
from .db.session import engine
from .dependencias import obtener_sesion
from .routers import (
    auth,
    boletin_contratado,
    conceptos,
    datos_personales,
    historico,
    me,
    noticias,
    retiros,
    salud,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if config.PROBLEMAS:
        logger.error(
            "CONFIGURACIÓN DE AUTENTICACIÓN INCOMPLETA — %s. El proceso arranca igual "
            "para poder diagnosticarse (ver db/bootstrap.py, misma invariante), pero "
            "NADIE puede entrar: /api/auth/* y /api/me responden 503 y ninguna cookie "
            "de sesión se considera válida.",
            "; ".join(config.PROBLEMAS),
        )
    for aviso in config.ADVERTENCIAS:
        logger.warning("Configuración: %s", aviso)
    bootstrap.ensure_schema(engine)
    yield


app = FastAPI(
    title="COIPO_PRENSA API",
    lifespan=lifespan,
    # La superficie de la API deja de ser pública en producción.
    docs_url=None if config.ES_PRODUCCION else "/docs",
    redoc_url=None,
    openapi_url=None if config.ES_PRODUCCION else "/openapi.json",
)

# /api/auth/* y /api/me son la PUERTA: no pueden exigir sesión (sí configuración).
app.include_router(auth.router)
# Mismo callback bajo /auth/callback, la ruta con la que están registradas las demás
# aplicaciones del ecosistema COIPO en el IAM. Ver el comentario en routers/auth.py.
app.include_router(auth.router_compat)
app.include_router(me.router)

# PÚBLICO por decisión del mandante: la portada del boletín se lee sin sesión.
# El endpoint usa `sesion_opcional`, así que un admin autenticado igual obtiene el
# modo auditoría (?incluirExcluidas=true) y un anónimo solo ve lo visible.
app.include_router(noticias.router)

# El resto de /api/ sigue detrás del login. La dependencia va ACÁ, en la
# composición, y no repetida endpoint por endpoint: así no hay forma de agregar un
# endpoint nuevo y olvidarse del guard.
app.include_router(historico.router, dependencies=[Depends(obtener_sesion)])
# conceptos declara sus propias dependencias por endpoint (lectura para cualquier
# autenticado, escritura solo admin), así que no lleva el guard genérico acá.
app.include_router(conceptos.router)

# retiros: el POST es PÚBLICO por diseño (un medio debe poder pedir la baja de su nota
# sin tener cuenta en el IAM de CONAF); GET y PATCH exigen admin. Por eso declara sus
# guards por endpoint y no lleva el genérico acá.
app.include_router(retiros.router)

# Boletín del servicio contratado: lo LEE cualquier autenticado (general y admin) y lo
# ESCRIBE solo un admin, así que declara sus guards por endpoint y no lleva el genérico.
# NO se monta con exigir_configuracion: en CI no hay .env, config.CONFIGURACION_OK es
# False y todos los tests de este router responderían 503 en vez de lo que prueban.
app.include_router(boletin_contratado.router)

# Derechos del titular: localizar y suprimir lo asociado a un nombre. Declara su propio
# guard (solo admin, auditado); buscar personas por nombre es en sí un tratamiento de
# datos y no puede quedar al alcance del rol `general`.
app.include_router(datos_personales.router)

# /health NO lleva sesión: lo consume el healthcheck de docker-compose.yml, que pega
# con urllib sin cookies. Si exigiera sesión, el contenedor quedaría unhealthy para
# siempre y `app` (depends_on: service_healthy) nunca arrancaría: el sitio entero
# caído, que es justo el error #1 declarado inaceptable por SECOM.
app.include_router(salud.router)
