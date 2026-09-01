"""Boletín de prensa del servicio que CONAF tiene CONTRATADO (Simbiu MediaStation).

Este router expone UN ENLACE, jamás contenido. El boletín se abre en el sitio del
proveedor: no se descarga, no se proxea, no se incrusta y no se copia. Ver el bloque de
`boletines_contratados` en db/schema.sql para el porqué completo.

Tres superficies en un mismo router, por eso declara sus guards por endpoint y no lleva
uno genérico en el montaje (igual que conceptos y retiros):

  - GET    /api/boletin-contratado/actual  Cualquier AUTENTICADO (general o admin).
  - GET    /api/boletin-contratado         Solo admin: el registro administrativo.
  - POST   /api/boletin-contratado         Solo admin: registrar o corregir el del día.
  - DELETE /api/boletin-contratado/{id}    Solo admin.

NUNCA anónimo: es el requisito central. `obtener_sesion` responde 401 sin sesión, y no
existe una versión recortada para la superficie pública — acá no hay dos superficies,
hay una puerta.

TRAMPA DE LOS TESTS: nada de db.get() ni .first(). El intérprete parcial de
backend/tests/conftest.py no implementa .first(), y su db.get() devuelve SIEMPRE la fila
de metadatos ignorando modelo y clave, así que un test de 404 escrito sobre él daría
verde para siempre. El acceso a la tabla vive en servicios/boletin_contratado.py y usa
.filter(...).limit(n).all().
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..dependencias import Sesion, obtener_sesion, requerir_admin_escritura
from ..schemas import (
    BoletinContratadoActualAdminOut,
    BoletinContratadoActualOut,
    BoletinContratadoGuardadoOut,
    BoletinContratadoIn,
    BoletinesContratadosOut,
)
from ..servicios import auditoria
from ..servicios import boletin_contratado as servicio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boletin-contratado")

# Tope del registro administrativo. Son ~250 filas al año; 60 cubre un trimestre y evita
# que el panel crezca sin techo.
MAX_HISTORICO = 60


# response_model=None y el modelo elegido a mano, como en routers/noticias.py: una Union
# dejaría que FastAPI escogiera "el primero que valide" y, como la forma del rol `general`
# es subconjunto de la del admin, esa elección sería silenciosa y siempre a favor de la
# más pequeña... o de la más grande, según el orden. Acá la elección la hace la sesión.
@router.get("/actual", response_model=None)
def actual(
    response: Response,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(obtener_sesion),
) -> dict:
    """El boletín más reciente registrado. `null` si no hay ninguno — nunca 404."""
    # no-store por el mismo motivo que /api/me: un proxy que cachee esta respuesta se la
    # serviría a quien no tiene sesión.
    response.headers["Cache-Control"] = "no-store"

    fila = servicio.ultimo(db)
    # El recorte de los datos de operación ocurre ACÁ, en el servidor. Un usuario
    # `general` no recibe quién registró el enlace, no es que React se lo esconda.
    modelo = BoletinContratadoActualAdminOut if sesion.es_admin else BoletinContratadoActualOut

    boletin = None
    if fila is not None:
        boletin = servicio.salida(fila, incluir_operacion=sesion.es_admin)
        # El desglose lo ve CUALQUIER autenticado: es el boletín, no un dato de operación.
        boletin["secciones"] = servicio.agrupar(servicio.noticias_de(db, fila.id))

    return modelo.model_validate({"boletin": boletin}).model_dump(mode="json")


@router.get("", response_model=BoletinesContratadosOut)
def listar(
    response: Response,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    filas = servicio.historico(db, limite=MAX_HISTORICO)
    return {"boletines": [servicio.salida(f, incluir_operacion=True) for f in filas]}


@router.post("", response_model=BoletinContratadoGuardadoOut)
def registrar(
    cuerpo: BoletinContratadoIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    """Alta o corrección del boletín de un día.

    201 si es nuevo, 200 si corrige uno ya registrado para esa fecha. Volver a pegar el
    mismo enlace es idempotente: el índice único (proveedor, fecha) lo garantiza.
    """
    response.headers["Cache-Control"] = "no-store"

    # cuerpo.url ya viene validada y canonizada por el field_validator; se vuelve a pasar
    # por normalizar_enlace (que es idempotente) solo para obtener el `documento_id`.
    enlace = servicio.normalizar_enlace(cuerpo.url)
    # Se consulta ANTES de escribir: después de la corrección ya no se sabría cuál era el
    # identificador previo con el que comparar.
    anterior = servicio.documento_anterior_a(db, cuerpo.fecha)

    try:
        fila, creada, antes = servicio.registrar(
            db,
            enlace=enlace,
            fecha=cuerpo.fecha,
            origen="manual",
            actor=sesion.usuario,
            sub=sesion.sub,
            ip=auditoria.origen(request),
        )
    except IntegrityError:
        # Dos admins la misma mañana: la comprobación previa no basta y el índice único
        # es el árbitro. Mismo patrón que conceptos.crear.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Otro administrador acaba de registrar el boletín de ese día. Recargue la página.",
        ) from None

    if creada:
        response.status_code = status.HTTP_201_CREATED
        auditoria.registrar(
            db, "BOLETIN_CONTRATADO_REGISTRADO",
            usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
            ip=auditoria.origen(request),
            objeto="boletin_contratado", objeto_id=str(fila.id),
            detalle={
                "fecha": fila.fecha.isoformat(),
                "url": fila.url,
                "documentoId": fila.documento_id,
                "origen": fila.origen,
            },
        )
    else:
        auditoria.registrar(
            db, "BOLETIN_CONTRATADO_CORREGIDO",
            usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
            ip=auditoria.origen(request),
            objeto="boletin_contratado", objeto_id=str(fila.id),
            detalle={
                "fecha": fila.fecha.isoformat(),
                "antes": antes,
                "despues": {"url": fila.url, "documentoId": fila.documento_id},
            },
        )

    aviso = None
    if servicio.identificador_retrocede(fila.documento_id, anterior):
        aviso = (
            f"El identificador del documento ({fila.documento_id}) es menor que el del "
            f"boletín anterior ({anterior}). Verifique que sea el enlace correcto."
        )

    return {"boletin": servicio.salida(fila, incluir_operacion=True), "aviso": aviso}


@router.delete("/{boletin_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(
    boletin_id: int,
    request: Request,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> Response:
    """Borrado duro: la traza de qué se borró queda en `auditoria`, no en esta tabla.

    Es la salida cuando el admin se equivocó de FECHA (equivocarse de enlace se corrige
    volviendo a registrar el mismo día).
    """
    fila = servicio.por_id(db, boletin_id)
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Boletín no encontrado")

    borrado = {
        "fecha": fila.fecha.isoformat(),
        "url": fila.url,
        "documentoId": fila.documento_id,
    }
    db.delete(fila)
    db.commit()

    auditoria.registrar(
        db, "BOLETIN_CONTRATADO_ELIMINADO",
        usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        ip=auditoria.origen(request),
        objeto="boletin_contratado", objeto_id=str(boletin_id),
        detalle=borrado,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
