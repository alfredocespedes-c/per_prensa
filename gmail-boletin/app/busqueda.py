"""Búsqueda de mensajes con la sintaxis de Gmail, con paginación real.

REQUISITO CLAVE: poder procesar más de 500 mensajes. `users.messages.list` devuelve como
máximo 500 por página y entrega un `nextPageToken`; quedarse en la primera respuesta es
el error que hace que una búsqueda "solo encuentre 500 correos".

Devuelve un GENERADOR de identificadores: quien consume decide cuántos materializa, y no
se guarda en memoria una lista de decenas de miles de ids para luego cortarla.
"""
import logging
from collections.abc import Iterator

from .cliente_gmail import ejecutar

logger = logging.getLogger(__name__)

# Tope por página que admite la Gmail API.
POR_PAGINA = 500


def buscar_ids(servicio, query: str, maximo: int = 0) -> Iterator[str]:
    """Ids de los mensajes que casan con `query`. `maximo=0` = todos, paginando."""
    entregados = 0
    token = None
    pagina = 0

    while True:
        # Se pide justo lo que falta: con maximo=5 no tiene sentido traer 500.
        por_pedir = POR_PAGINA if maximo == 0 else min(POR_PAGINA, maximo - entregados)
        if por_pedir <= 0:
            return

        peticion = servicio.users().messages().list(
            userId="me", q=query, maxResults=por_pedir, pageToken=token
        )
        respuesta = ejecutar(peticion, "buscar mensajes")
        pagina += 1

        mensajes = respuesta.get("messages") or []
        logger.debug("Página %d de resultados: %d mensajes.", pagina, len(mensajes))

        for mensaje in mensajes:
            yield mensaje["id"]
            entregados += 1
            if maximo and entregados >= maximo:
                return

        token = respuesta.get("nextPageToken")
        if not token:
            return
