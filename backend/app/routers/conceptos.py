"""CRUD de conceptos de búsqueda y exclusión — la "interfaz de administración" v3.

Lectura: cualquier usuario autenticado. Escritura: solo el rol admin, verificado en el
SERVIDOR (el `esAdmin` que consume el frontend es presentacional).

Los cambios NO son inmediatos: el collector los toma en su corrida horaria (minuto
:00). `proximaAplicacion` viaja en el GET para que la UI lo diga con hora concreta en
vez de dejar al admin creyendo que la función no sirve.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.models import Concepto, ConceptoTipoOculto, Seccion
from ..db.session import get_db
from ..dependencias import Sesion, obtener_sesion, requerir_admin_escritura
from ..schemas import (
    ConceptoIn,
    ConceptoOut,
    ConceptoPatch,
    ConceptosOut,
    ImpactoOut,
    OrdenIn,
    TiposOcultosIn,
)
from ..servicios import auditoria
from ..servicios.conceptos import (
    MAX_ACTIVOS_POR_TIPO,
    ahora_utc,
    plegar_concepto,
    proxima_corrida,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/conceptos")

LIMITE_TITULARES = 20


def _salida(fila: Concepto, ocultos: dict[int, list[str]] | None = None) -> dict:
    return {
        "id": fila.id,
        "texto": fila.texto,
        "tipo": fila.tipo,
        "activo": fila.activo,
        "creadoEn": fila.creado_en,
        "creadoPor": fila.creado_por,
        "actualizadoEn": fila.actualizado_en,
        "actualizadoPor": fila.actualizado_por,
        "orden": fila.orden or 0,
        "tiposOcultos": (ocultos or {}).get(fila.id, []),
    }


def _tipos_ocultos(db: Session) -> dict[int, list[str]]:
    ocultos: dict[int, list[str]] = {}
    for fila in db.query(ConceptoTipoOculto).all():
        ocultos.setdefault(fila.concepto_id, []).append(fila.seccion_id)
    return ocultos


def _buscar_por_texto(db: Session, texto: str) -> Concepto | None:
    """Busca por la forma plegada, que es la clave del índice único."""
    return (
        db.query(Concepto)
        .filter(Concepto.texto_normalizado == plegar_concepto(texto))
        .one_or_none()
    )


def _contar_activos(db: Session, tipo: str, excluyendo_id: int | None = None) -> int:
    consulta = db.query(func.count(Concepto.id)).filter(
        Concepto.activo.is_(True), Concepto.tipo == tipo
    )
    if excluyendo_id is not None:
        consulta = consulta.filter(Concepto.id != excluyendo_id)
    return consulta.scalar() or 0


def _exigir_que_quede_alguno_de_busqueda(db: Session, concepto: Concepto) -> None:
    """Sin conceptos de inclusión activos el recolector no trae nada.

    El collector igual cae a la semilla de config/conceptos.js (nunca se queda sin
    boletín), pero dejar que el admin vacíe la lista sin avisar produciría un estado
    en que lo que se busca ya no es lo que dice la pantalla.
    """
    if concepto.tipo != "incluir" or not concepto.activo:
        return
    if _contar_activos(db, "incluir", excluyendo_id=concepto.id) == 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                "Debe quedar al menos un concepto de búsqueda activo: sin ninguno, "
                "el recolector dejaría de traer noticias."
            ),
        )


@router.get("", response_model=ConceptosOut)
def listar(
    tipo: str | None = Query(default=None, pattern="^(incluir|excluir)$"),
    incluirInactivos: bool = False,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(obtener_sesion),
) -> dict:
    # Lo puede ver cualquier autenticado: toda la app ya está detrás del login, el
    # resaltado del extracto revela de facto qué se busca, y poder explicar por qué
    # apareció o desapareció una noticia es la transparencia que evita el reporte de
    # "está mostrando ruido".
    consulta = db.query(Concepto)
    if not incluirInactivos:
        consulta = consulta.filter(Concepto.activo.is_(True))
    if tipo:
        consulta = consulta.filter(Concepto.tipo == tipo)
    # Por `orden` y NO por creado_en: el orden de inserción como criterio de presentación
    # es justo lo que la jerarquía vino a reemplazar. La fecha queda solo como desempate
    # determinista entre dos conceptos con el mismo orden.
    filas = consulta.order_by(Concepto.orden, Concepto.creado_en, Concepto.id).all()
    ocultos = _tipos_ocultos(db)
    secciones = db.query(Seccion).order_by(Seccion.orden).all()

    return {
        "conceptos": [_salida(fila, ocultos) for fila in filas],
        "secciones": [{"id": s.id, "nombre": s.nombre, "orden": s.orden} for s in secciones],
        "proximaAplicacion": proxima_corrida(ahora_utc()),
        "editable": sesion.es_admin,
    }


# --- Ordenamiento de la jerarquía ---------------------------------------------------
# Reordenamiento MASIVO y no "mover uno": el arrastre reacomoda varias posiciones a la
# vez, y aplicarlas de a una dejaría estados intermedios con órdenes duplicados visibles
# para el collector si una corrida cae en medio.


@router.patch("/orden", status_code=status.HTTP_204_NO_CONTENT)
def reordenar_conceptos(
    cuerpo: OrdenIn,
    request: Request,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> Response:
    porId = {int(item.id): item.orden for item in cuerpo.items}
    for fila in db.query(Concepto).all():
        if fila.id in porId:
            fila.orden = porId[fila.id]
    db.commit()

    auditoria.registrar(
        db, "CONCEPTOS_REORDENADOS", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        ip=auditoria.origen(request), objeto="concepto",
        detalle={"orden": {str(k): v for k, v in porId.items()}},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/tipos-orden", status_code=status.HTTP_204_NO_CONTENT)
def reordenar_tipos(
    cuerpo: OrdenIn,
    request: Request,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> Response:
    """Nivel 2: orden GLOBAL de los tipos de medio.

    Escribe `secciones.orden`. El collector ya no pisa esa columna (ver
    archivador-postgres.js): si lo hiciera, la corrida horaria siguiente revertiría lo
    que el admin acaba de arrastrar.
    """
    porId = {item.id: item.orden for item in cuerpo.items}
    for fila in db.query(Seccion).all():
        if fila.id in porId:
            fila.orden = porId[fila.id]
    db.commit()

    auditoria.registrar(
        db, "TIPOS_MEDIO_REORDENADOS", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        ip=auditoria.origen(request), objeto="seccion", detalle={"orden": porId},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{concepto_id}/tipos-ocultos", status_code=status.HTTP_204_NO_CONTENT)
def fijar_tipos_ocultos(
    concepto_id: int,
    cuerpo: TiposOcultosIn,
    request: Request,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> Response:
    """PUT y no PATCH: el cuerpo es la lista COMPLETA de ocultos, no un incremento."""
    if db.get(Concepto, concepto_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concepto no encontrado")

    for fila in db.query(ConceptoTipoOculto).filter(
        ConceptoTipoOculto.concepto_id == concepto_id
    ).all():
        db.delete(fila)
    for seccion_id in dict.fromkeys(cuerpo.tiposOcultos):
        db.add(ConceptoTipoOculto(concepto_id=concepto_id, seccion_id=seccion_id))
    db.commit()

    auditoria.registrar(
        db, "TIPOS_MEDIO_OCULTADOS", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        ip=auditoria.origen(request), objeto="concepto", objeto_id=str(concepto_id),
        detalle={"tiposOcultos": cuerpo.tiposOcultos},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("", response_model=ConceptoOut, status_code=status.HTTP_201_CREATED)
def crear(
    cuerpo: ConceptoIn,
    response: Response,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    existente = _buscar_por_texto(db, cuerpo.texto)

    if existente is not None and existente.activo:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"«{existente.texto}» ya existe como concepto de "
                f"{'búsqueda' if existente.tipo == 'incluir' else 'exclusión'} "
                "(se comparan sin distinguir mayúsculas ni tildes)."
            ),
        )

    if _contar_activos(db, cuerpo.tipo) >= MAX_ACTIVOS_POR_TIPO:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"Máximo {MAX_ACTIVOS_POR_TIPO} conceptos activos de este tipo "
                "(límite de rendimiento del recolector)."
            ),
        )

    if existente is not None:
        # Reactivación. El borrado es suave, así que la clave única sigue ocupada por
        # la fila inactiva: responder 409 acá sería incomprensible para el admin
        # ("dice que ya existe pero no lo veo en la lista").
        existente.activo = True
        existente.tipo = cuerpo.tipo
        existente.texto = cuerpo.texto
        existente.actualizado_por = sesion.usuario
        existente.actualizado_en = ahora_utc()
        fila = existente
        response.status_code = status.HTTP_200_OK
        evento = "CONCEPTO_REACTIVADO"
    else:
        fila = Concepto(
            texto=cuerpo.texto,
            tipo=cuerpo.tipo,
            activo=True,
            creado_en=ahora_utc(),
            creado_por=sesion.usuario,
            actualizado_en=ahora_utc(),
            actualizado_por=sesion.usuario,
        )
        db.add(fila)
        evento = "CONCEPTO_CREADO"

    try:
        db.commit()
    except IntegrityError:
        # Carrera entre dos admins: la comprobación previa no basta, el índice único es
        # el único árbitro.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"«{cuerpo.texto}» ya existe (se comparan sin mayúsculas ni tildes).",
        )
    db.refresh(fila)

    auditoria.registrar(
        db, evento, usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        objeto="concepto", objeto_id=str(fila.id),
        detalle={"texto": fila.texto, "tipo": fila.tipo},
    )
    return _salida(fila)


@router.patch("/{concepto_id}", response_model=ConceptoOut)
def actualizar(
    concepto_id: int,
    cuerpo: ConceptoPatch,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    fila = db.get(Concepto, concepto_id)
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concepto no encontrado")

    antes = {"texto": fila.texto, "tipo": fila.tipo, "activo": fila.activo}

    # Quedarse sin conceptos de búsqueda se puede provocar de tres formas: borrando,
    # desactivando, o moviendo el último a "excluir".
    if (cuerpo.activo is False) or (cuerpo.tipo == "excluir" and fila.tipo == "incluir"):
        _exigir_que_quede_alguno_de_busqueda(db, fila)

    if cuerpo.texto is not None:
        fila.texto = cuerpo.texto
    if cuerpo.tipo is not None:
        fila.tipo = cuerpo.tipo
    if cuerpo.activo is not None:
        fila.activo = cuerpo.activo
    fila.actualizado_por = sesion.usuario
    fila.actualizado_en = ahora_utc()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Ya existe otro concepto con ese texto (sin distinguir mayúsculas ni tildes).",
        )
    db.refresh(fila)

    auditoria.registrar(
        db, "CONCEPTO_ACTUALIZADO", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        objeto="concepto", objeto_id=str(fila.id),
        detalle={"antes": antes, "despues": {"texto": fila.texto, "tipo": fila.tipo, "activo": fila.activo}},
    )
    return _salida(fila)


@router.delete("/{concepto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(
    concepto_id: int,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> Response:
    fila = db.get(Concepto, concepto_id)
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concepto no encontrado")

    _exigir_que_quede_alguno_de_busqueda(db, fila)

    # BORRADO SUAVE, nunca DELETE FROM: conserva la auditoría y permite reactivar.
    fila.activo = False
    fila.actualizado_por = sesion.usuario
    fila.actualizado_en = ahora_utc()
    db.commit()

    auditoria.registrar(
        db, "CONCEPTO_ELIMINADO", usuario=sesion.usuario, sub=sesion.sub, rol=sesion.rol,
        objeto="concepto", objeto_id=str(fila.id),
        detalle={"texto": fila.texto, "tipo": fila.tipo},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/impacto", response_model=ImpactoOut)
def impacto(
    concepto: str | None = None,
    db: Session = Depends(get_db),
    sesion: Sesion = Depends(requerir_admin_escritura),
) -> dict:
    """Cuántas noticias oculta cada concepto excluido, y cuáles.

    Es exacto, no una aproximación: lo produjo el propio collector al marcar. Si el
    admin excluyó «CMPC» y aparece "CONAF y CMPC firman convenio", lo ve literalmente
    escrito y decide.
    """
    por_concepto = db.execute(
        text(
            """
            SELECT c AS concepto, count(*) AS ocultas
            FROM noticias n, unnest(n.excluida_por) AS c
            WHERE n.excluida
            GROUP BY c
            ORDER BY ocultas DESC
            """
        )
    ).mappings().all()

    titulares: list = []
    if concepto:
        titulares = db.execute(
            text(
                """
                SELECT id, url, titular, medio_nombre, fecha
                FROM noticias
                WHERE excluida AND :concepto = ANY(excluida_por)
                ORDER BY fecha DESC NULLS LAST
                LIMIT :limite
                """
            ),
            {"concepto": concepto, "limite": LIMITE_TITULARES},
        ).mappings().all()

    return {
        "porConcepto": [{"concepto": f["concepto"], "ocultas": f["ocultas"]} for f in por_concepto],
        "titulares": [
            {
                "id": f["id"],
                "url": f["url"],
                "titular": f["titular"],
                "medioNombre": f["medio_nombre"],
                "fecha": f["fecha"],
            }
            for f in titulares
        ],
    }
