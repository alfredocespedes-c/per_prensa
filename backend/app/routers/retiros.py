"""Solicitudes de retiro de contenido.

Dos superficies muy distintas en un mismo router:

  - POST  /api/retiros   PÚBLICO. Un medio pide que dejemos de listar su nota. Exigirle
                         una cuenta en COIPO IAM al dueño del contenido convertiría el
                         derecho en un trámite inaccesible.
  - GET   /api/retiros   Solo admin. La bandeja de solicitudes.
  - PATCH /api/retiros/N Solo admin. Aplicar o rechazar.

La solicitud pública NO retira nada por sí sola: crea una fila 'pendiente'. Si bastara
con enviar el formulario, cualquiera podría vaciar el boletín. Una vez que el admin la
aplica, el efecto SÍ es inmediato en ambas superficies, porque el filtro es de lectura y
no espera la corrida horaria del recolector (ver servicios/retiros.py).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..db.models import Retiro
from ..db.session import get_db
from ..dependencias import Sesion, requerir_admin_escritura
from ..schemas import RetiroCreadoOut, RetiroIn, RetiroPatch, RetirosOut
from ..servicios import auditoria

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/retiros")

# Tope de solicitudes pendientes. El POST es anónimo, así que sin un techo un script
# podría llenar la tabla. Se cuentan solo las PENDIENTES: las ya resueltas no consumen
# cupo, de modo que el tope nunca bloquea a un medio legítimo mientras el admin atienda
# la bandeja.
MAX_PENDIENTES = 500


def _salida(fila: Retiro) -> dict:
    return {
        "id": fila.id,
        "ambito": fila.ambito,
        "clave": fila.clave,
        "estado": fila.estado,
        "solicitante": fila.solicitante,
        "contacto": fila.contacto,
        "motivo": fila.motivo,
        "creadoEn": fila.creado_en,
        "aplicadoEn": fila.aplicado_en,
        "aplicadoPor": fila.aplicado_por,
    }


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


@router.post("", response_model=RetiroCreadoOut, status_code=status.HTTP_201_CREATED)
def crear(cuerpo: RetiroIn, request: Request, db: Session = Depends(get_db)) -> dict:
    pendientes = db.query(Retiro).filter(Retiro.estado == "pendiente").count()
    if pendientes >= MAX_PENDIENTES:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Hay demasiadas solicitudes sin resolver en este momento. "
                "Escriba a uia@conaf.cl y la atenderemos por correo."
            ),
        )

    fila = Retiro(
        ambito=cuerpo.ambito,
        clave=cuerpo.clave,
        solicitante=cuerpo.solicitante,
        contacto=cuerpo.contacto,
        motivo=cuerpo.motivo,
        estado="pendiente",
        creado_en=_ahora(),
        ip_origen=auditoria.origen(request),
    )
    db.add(fila)
    db.commit()

    auditoria.registrar(
        db, "RETIRO_SOLICITADO", ip=auditoria.origen(request),
        objeto="retiro", objeto_id=str(fila.id),
        detalle={"ambito": fila.ambito, "clave": fila.clave},
    )
    # Sin id ni estado: quien envió el formulario no está autenticado, y devolverle un
    # identificador consultable abriría una vía para enumerar solicitudes ajenas.
    return {"recibida": True}


@router.get("", response_model=RetirosOut)
def listar(
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    filas = db.query(Retiro).order_by(Retiro.creado_en.desc()).all()
    return {"retiros": [_salida(f) for f in filas]}


@router.patch("/{retiro_id}")
def resolver(
    retiro_id: int,
    cuerpo: RetiroPatch,
    request: Request,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    fila = db.get(Retiro, retiro_id)
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")

    antes = {"estado": fila.estado, "clave": fila.clave}

    # La clave se puede corregir al resolver: el medio escribe su dominio y el filtro de
    # lectura necesita el medio_id exacto que usa el recolector.
    if cuerpo.clave is not None:
        fila.clave = cuerpo.clave.strip()
    if cuerpo.estado is not None:
        fila.estado = cuerpo.estado
        if cuerpo.estado == "aplicado":
            fila.aplicado_en = _ahora()
            fila.aplicado_por = sesion.usuario
        else:
            # Revertir un retiro devuelve la nota al boletín en el siguiente refresco, y
            # limpiar la marca evita que quede diciendo que sigue aplicado.
            fila.aplicado_en = None
            fila.aplicado_por = None

    db.commit()
    db.refresh(fila)

    auditoria.registrar(
        db, "RETIRO_RESUELTO", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        ip=auditoria.origen(request), objeto="retiro", objeto_id=str(fila.id),
        detalle={"antes": antes, "despues": {"estado": fila.estado, "clave": fila.clave}},
    )
    return _salida(fila)
