"""Atención de solicitudes de derechos del titular sobre datos personales.

Permite localizar y eliminar los registros asociados a un nombre. Es la contraparte
operativa de la política: sin una forma concreta de responder "¿qué tienen sobre mí?" y
"bórrenlo", la declaración no se puede cumplir.

Decisiones que importan:

  - SOLO ADMIN, y auditado. Buscar personas por nombre es, en sí mismo, el uso que la
    política restringe: existe para atender una solicitud formal, no para consultar.
  - La búsqueda es sobre `autor`, `titular` y `extracto`, que son los tres lugares donde
    puede quedar un nombre. `analisis.personas` ya no se produce (ver
    collector/src/dominio/entidades.js); las filas viejas que aún lo traigan se limpian
    con la purga de retención y con scripts/migracion-privacidad.mjs.
  - El borrado es REAL (DELETE), no un marcado: un derecho de supresión que solo oculta
    no es supresión. Por eso además se registra un retiro aplicado, para que el
    recolector no vuelva a ingresar la misma nota en la corrida siguiente.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from ..db.models import Noticia, Retiro
from ..db.session import get_db
from ..dependencias import Sesion, requerir_admin_escritura
from ..schemas import CoincidenciaDatosOut, DatosPersonalesOut, SupresionOut
from ..servicios import auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datos-personales")

# Un nombre demasiado corto ("Ana") casaría con media base y convertiría una supresión en
# un borrado masivo. El piso es una salvaguarda contra el error humano, no contra abuso.
LARGO_MINIMO_NOMBRE = 4
LIMITE_COINCIDENCIAS = 200


def _coincide(fila, aguja: str) -> list[str]:
    """Dónde aparece el nombre en esta fila. Lista vacía = no aparece."""
    donde = []
    if fila.autor and aguja in fila.autor.lower():
        donde.append("autor")
    if fila.titular and aguja in fila.titular.lower():
        donde.append("titular")
    texto_extracto = " ".join(
        str(fragmento.get("texto", "")) for fragmento in (fila.extracto or []) if isinstance(fragmento, dict)
    )
    if aguja in texto_extracto.lower():
        donde.append("extracto")
    analisis = fila.analisis or {}
    if isinstance(analisis, dict):
        for persona in analisis.get("personas") or []:
            if aguja in str(persona).lower():
                donde.append("analisis.personas")
                break
    return donde


def _buscar(db: Session, nombre: str) -> list:
    """Filtra en Python y no en SQL a propósito.

    El nombre puede estar dentro del JSONB del extracto o del análisis, así que una
    consulta exacta no serviría y una con ILIKE sobre el JSON serializado daría falsos
    positivos (casaría con nombres de campo). Esto se ejecuta a mano, unas pocas veces al
    año, sobre una tabla acotada por la retención: la simplicidad vale más que el plan de
    ejecución.
    """
    aguja = nombre.strip().lower()
    encontradas = []
    for fila in db.query(Noticia).all():
        donde = _coincide(fila, aguja)
        if donde:
            encontradas.append((fila, donde))
        if len(encontradas) >= LIMITE_COINCIDENCIAS:
            break
    return encontradas


def _validar(nombre: str) -> str:
    limpio = nombre.strip()
    if len(limpio) < LARGO_MINIMO_NOMBRE:
        raise HTTPException(
            422,  # UNPROCESSABLE_CONTENT; la constante de Starlette cambió de nombre
            detail=(
                f"Indique al menos {LARGO_MINIMO_NOMBRE} caracteres. Un nombre muy corto "
                "coincidiría con demasiadas noticias y la supresión sería un borrado masivo."
            ),
        )
    return limpio


@router.get("", response_model=DatosPersonalesOut)
def localizar(
    request: Request,
    nombre: str = Query(min_length=1),
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    limpio = _validar(nombre)
    encontradas = _buscar(db, limpio)

    # Se audita la BÚSQUEDA, no solo el borrado: consultar por el nombre de una persona
    # es en sí un tratamiento de datos y debe quedar trazado.
    auditoria.registrar(
        db, "DATOS_PERSONALES_CONSULTADOS", usuario=sesion.usuario, sub=sesion.sub,
        rol=sesion.rol, ip=auditoria.origen(request), objeto="datos_personales",
        detalle={"nombre": limpio, "coincidencias": len(encontradas)},
    )

    return {
        "nombre": limpio,
        "total": len(encontradas),
        "truncado": len(encontradas) >= LIMITE_COINCIDENCIAS,
        "coincidencias": [
            {
                "id": fila.id,
                "url": fila.url,
                "titular": fila.titular,
                "medioNombre": fila.medio_nombre,
                "fecha": fila.fecha,
                "campos": donde,
            }
            for fila, donde in encontradas
        ],
    }


@router.delete("", response_model=SupresionOut)
def suprimir(
    request: Request,
    nombre: str = Query(min_length=1),
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    limpio = _validar(nombre)
    encontradas = _buscar(db, limpio)

    ahora = datetime.now(timezone.utc)
    for fila, _donde in encontradas:
        # Retiro aplicado ANTES de borrar: si solo se borrara la fila, el recolector la
        # volvería a ingresar desde el feed en la corrida siguiente y la supresión
        # duraría menos de una hora.
        db.add(
            Retiro(
                ambito="noticia",
                clave=fila.id,
                motivo=f"Supresión por derecho del titular ({limpio})",
                solicitante=sesion.usuario,
                estado="aplicado",
                creado_en=ahora,
                aplicado_en=ahora,
                aplicado_por=sesion.usuario,
            )
        )
        db.delete(fila)
    db.commit()

    auditoria.registrar(
        db, "DATOS_PERSONALES_SUPRIMIDOS", usuario=sesion.usuario, sub=sesion.sub,
        rol=sesion.rol, ip=auditoria.origen(request), objeto="datos_personales",
        detalle={"nombre": limpio, "borradas": len(encontradas)},
    )

    return {"nombre": limpio, "borradas": len(encontradas)}
