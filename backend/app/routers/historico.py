"""GET /api/historico — archivo paginado respaldado por la tabla `noticias`, que el
collector acumula sin borrar filas (upsert-only, ver
collector/src/adaptadores/archivador-postgres.js). Distinto de datos/historico.json
(rotación de 400 días que el collector ya genera aparte, ver dominio/historico.js) —
no confundir los dos: mismo nombre, propósitos y respaldos distintos.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db.models import Noticia
from ..db.session import get_db
from ..dependencias import Sesion, obtener_sesion
from ..schemas import HistoricoPageOut
from ..servicios.mapeo import fila_a_noticia
from ..servicios.retiros import claves_retiradas, excluir_retiradas

router = APIRouter()

TAMANO_PAGINA_MAXIMO = 200
RANGO_POR_DEFECTO_DIAS = 30
RANGO_MAXIMO_DIAS = 400  # Cota dura del look-back (SEC-02): nunca se escanea más allá.


@router.get("/api/historico", response_model=HistoricoPageOut)
def obtener_historico(
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
    medioId: Optional[str] = None,
    seccionId: Optional[str] = None,
    incluirExcluidas: bool = False,
    pagina: int = Query(default=1, ge=1),
    tamanoPagina: int = Query(default=50, ge=1, le=TAMANO_PAGINA_MAXIMO),
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(obtener_sesion),
) -> dict:
    consulta = db.query(Noticia)

    # Retiros aplicados: el archivo tampoco puede seguir sirviendo lo que un medio pidió
    # retirar. Va antes del count() para que la paginación no cuente lo que no se muestra.
    consulta = excluir_retiradas(consulta, claves_retiradas(db))

    # Igual que /api/noticias: lo excluido se oculta salvo en el modo auditoría del
    # admin. Acá no hay ventana que materializar (el histórico ES el archivo), así que
    # el filtro va directo. Como el collector archiva TAMBIÉN las excluidas, este
    # endpoint es la prueba de que nada se perdió nunca.
    if not (incluirExcluidas and sesion.es_admin):
        consulta = consulta.filter(Noticia.excluida.is_(False))

    # Cota dura del rango temporal (SEC-02): por defecto, últimos 30 días; y aunque el
    # cliente envíe un `desde` más antiguo, jamás se escanea más allá de RANGO_MAXIMO_DIAS.
    # Con el índice en fecha_deteccion (db/schema.sql) y statement_timeout (session.py),
    # acota el costo por petición sobre la tabla `noticias`, que crece sin borrar filas.
    ahora = datetime.now(timezone.utc)
    rango_desde = desde or (ahora - timedelta(days=RANGO_POR_DEFECTO_DIAS))
    if rango_desde.tzinfo is None:
        rango_desde = rango_desde.replace(tzinfo=timezone.utc)
    piso_maximo = ahora - timedelta(days=RANGO_MAXIMO_DIAS)
    if rango_desde < piso_maximo:
        rango_desde = piso_maximo
    consulta = consulta.filter(Noticia.fecha_deteccion >= rango_desde)
    if hasta:
        consulta = consulta.filter(Noticia.fecha_deteccion <= hasta)
    if medioId:
        consulta = consulta.filter(Noticia.medio_id == medioId)
    if seccionId:
        consulta = consulta.filter(Noticia.seccion_id == seccionId)

    total = consulta.count()
    resultados = (
        consulta.order_by(Noticia.fecha.desc().nullslast(), Noticia.fecha_deteccion.desc(), Noticia.id.asc())
        .offset((pagina - 1) * tamanoPagina)
        .limit(tamanoPagina)
        .all()
    )

    return {
        "pagina": pagina,
        "tamanoPagina": tamanoPagina,
        "total": total,
        # Siempre superficie interna: este endpoint exige sesión (obtener_sesion), así
        # que nunca lo alcanza un anónimo. Va explícito y no por defecto para que la
        # decisión quede escrita donde se lee el endpoint.
        "resultados": [fila_a_noticia(n, "interna") for n in resultados],
    }
