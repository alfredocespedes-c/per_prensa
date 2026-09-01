"""GET /api/noticias — reemplazo directo de data/noticias.json (ver
frontend/src/datos.js). Mismo orden que collector/src/dominio/ventana.js
(compararNoticias): fecha desc, fecha_deteccion desc, id asc.

Omite deliberadamente resolucionesGoogle/sitemapVisto: son cachés internas del
collector que ningún componente del frontend lee ni valida (ver
frontend/src/contexto/ProveedorDatos.jsx).

Requiere sesión: la dependencia se aplica en el montaje (backend/app/main.py), no acá.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..config import TAMANO_VENTANA
from ..db.models import ColeccionMetadatos, Concepto, Noticia, Seccion
from ..db.session import get_db
from ..dependencias import Sesion, sesion_opcional
from ..schemas import EstadoNoticiasOut, EstadoPublicoOut
from ..servicios.mapeo import fila_a_noticia, superficie_de
from ..servicios.retiros import claves_retiradas, excluir_retiradas

router = APIRouter()


# response_model=None y validación explícita más abajo: este endpoint devuelve DOS
# contratos distintos según haya sesión o no, y una unión declarativa dejaría a FastAPI
# elegir por "el primero que valide". Como el shape público es un subconjunto estricto
# del interno, esa elección sería silenciosa y podría publicar campos internos. Acá el
# modelo se elige por la sesión, explícitamente, y el `extra="forbid"` de
# NoticiaPublicaOut hace fallar cualquier fuga en vez de servirla.
@router.get("/api/noticias", response_model=None)
def obtener_noticias(
    response: Response,
    incluirExcluidas: bool = Query(default=False),
    db: Session = Depends(get_db),
    # PÚBLICO: la portada se lee sin iniciar sesión (decisión del mandante). Un anónimo
    # recibe la ficha de referencia; el extracto y el análisis exigen sesión.
    sesion: Sesion | None = Depends(sesion_opcional),
) -> dict:
    response.headers["Cache-Control"] = "no-store"

    # La tabla `noticias` es un ARCHIVO acumulativo (el collector hace upsert y nunca
    # borra, ver archivador-postgres.js), no la ventana. Por eso hay que MATERIALIZAR
    # primero la ventana con el LIMIT y filtrar DESPUÉS.
    #
    # Filtrar antes del LIMIT sería un error silencioso y grave: al ocultar N noticias,
    # la consulta rellenaría con las N filas inmediatamente más antiguas —filas que
    # salieron de la ventana hace semanas y cuyo flag `excluida` nunca se recalculó, o
    # sea que siguen en false aunque mencionen el concepto excluido—. Resultado: el
    # concepto excluido SIGUE apareciendo en la portada, y encima vuelven noticias
    # viejas que el collector ya había retirado.
    #
    # Con este orden, ocultar noticias devuelve menos de TAMANO_VENTANA filas: las
    # excluidas ocupan cupo, que es exactamente la semántica que define el collector.
    ventana = (
        db.query(Noticia.id)
        .order_by(
            Noticia.fecha.desc().nullslast(),
            Noticia.fecha_deteccion.desc(),
            Noticia.id.asc(),
        )
        .limit(TAMANO_VENTANA)
        .subquery()
    )
    consulta = db.query(Noticia).join(ventana, Noticia.id == ventana.c.id)

    # Retiros aplicados: efecto inmediato en AMBAS superficies, sin esperar la corrida
    # horaria del recolector. Va después de materializar la ventana, igual que el filtro
    # de exclusiones y por el mismo motivo: filtrar antes del LIMIT rellenaría la ventana
    # con filas viejas que salieron hace semanas.
    consulta = excluir_retiradas(consulta, claves_retiradas(db))

    # Modo auditoría: solo el admin puede ver lo oculto, para comprobar que no se
    # perdió cobertura legítima. Para un usuario general —o anónimo— el parámetro se
    # IGNORA en vez de responder 403: un 403 le confirmaría que hay noticias ocultas.
    if not (incluirExcluidas and sesion is not None and sesion.es_admin):
        consulta = consulta.filter(Noticia.excluida.is_(False))

    noticias = consulta.order_by(
        Noticia.fecha.desc().nullslast(),
        Noticia.fecha_deteccion.desc(),
        Noticia.id.asc(),
    ).all()

    secciones = db.query(Seccion).order_by(Seccion.orden).all()
    metadatos = db.get(ColeccionMetadatos, 1)

    # Nivel 1 de la jerarquía. El boletín se agrupa por concepto y NO tiene bloque
    # "otras": el orden lo define el admin arrastrando, así que el frontend no puede
    # deducirlo de los datos y necesita esta lista.
    #
    # Se devuelven SOLO los conceptos que tienen noticias en la ventana. Mandar la lista
    # completa revelaría qué se está vigilando sin resultados —información que hoy no se
    # ve en ninguna parte— y en la superficie pública eso sería publicarlo.
    presentes = {n.concepto_principal for n in noticias if n.concepto_principal}
    conceptos = [
        {"texto": c.texto, "orden": c.orden or 0}
        for c in db.query(Concepto)
        .filter(Concepto.activo.is_(True), Concepto.tipo == "incluir")
        .order_by(Concepto.orden, Concepto.creado_en, Concepto.id)
        .all()
        if c.texto in presentes
    ]

    superficie = superficie_de(sesion)
    estado = {
        "generadoEn": metadatos.generado_en if metadatos else None,
        "tamanoVentana": metadatos.tamano_ventana if metadatos else TAMANO_VENTANA,
        "secciones": [{"id": s.id, "nombre": s.nombre, "orden": s.orden} for s in secciones],
        "conceptos": conceptos,
        "noticias": [fila_a_noticia(n, superficie) for n in noticias],
    }

    modelo = EstadoNoticiasOut if superficie == "interna" else EstadoPublicoOut
    # model_dump y no el objeto: FastAPI serializa el dict resultante sin volver a
    # aplicar ningún response_model, así que lo que valida es exactamente lo que sale.
    return modelo.model_validate(estado).model_dump(mode="json")
