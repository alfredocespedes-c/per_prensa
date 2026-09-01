"""Aplicación de los retiros sobre las consultas de noticias.

Un único lugar decide qué queda fuera por un retiro aplicado, y lo usan TANTO
/api/noticias como /api/historico. Si cada endpoint armara su propio filtro, bastaría
olvidarlo en uno para que el contenido retirado siguiera visible por ahí.

Por qué se filtra en LECTURA y no borrando filas:

  - Inmediatez. El recolector corre una vez por hora; un retiro que dependiera de él
    tardaría hasta 60 minutos en verse. Filtrando en la consulta, el efecto es el
    siguiente refresco de la página.
  - Reversibilidad. Un retiro aplicado por error se deshace cambiando el estado; si se
    hubieran borrado las filas, la nota volvería solo si el feed del medio todavía la
    tuviera, y los feeds rotan en horas.
  - Trazabilidad. Queda registro de que se pidió, quién lo pidió y cuándo se aplicó.

El borrado definitivo de las filas es otra cosa y tiene su propio mecanismo: la purga de
retención (collector/src/purga.js).
"""
from ..db.models import Noticia, Retiro


def claves_retiradas(db) -> dict[str, set[str]]:
    """{'noticia': {...urls}, 'medio': {...medio_id}} de los retiros APLICADOS.

    Solo el estado 'aplicado' filtra: una solicitud recién enviada por el formulario
    público no oculta nada hasta que un administrador la revisa. De lo contrario
    cualquiera podría vaciar el boletín rellenando un formulario.
    """
    retiradas: dict[str, set[str]] = {"noticia": set(), "medio": set()}
    for fila in db.query(Retiro).filter(Retiro.estado == "aplicado").all():
        if fila.ambito in retiradas and fila.clave:
            retiradas[fila.ambito].add(fila.clave.strip())
    return retiradas


def excluir_retiradas(consulta, retiradas: dict[str, set[str]]):
    """Añade a `consulta` el filtro de retiros. Sin retiros, la devuelve intacta.

    Dos `NOT IN` sobre columnas indexadas y nada más. La normalización de lo que el
    medio escribió en el formulario (un dominio, un nombre) al `medio_id` que usa el
    recolector ocurre ANTES, cuando el administrador aplica la solicitud: así el camino
    caliente —cada carga de la portada— no paga ningún emparejamiento difuso.
    """
    urls = retiradas.get("noticia") or set()
    medios = retiradas.get("medio") or set()
    # El caso normal es que no haya ningún retiro: devolver la misma consulta evita
    # pagar un predicado de más en cada carga de la portada.
    if urls:
        consulta = consulta.filter(Noticia.id.notin_(urls))
    if medios:
        consulta = consulta.filter(Noticia.medio_id.notin_(medios))
    return consulta
