"""Punto de entrada. Orquesta y traduce errores a códigos de salida; no hace más.

QUÉ HACE UNA PASADA:
  1. Busca en Gmail los correos que casan con GMAIL_QUERY (paginando).
  2. De cada uno saca el enlace del boletín, filtrando remitente, host y fecha.
  3. Los guarda en `boletines_contratados` (idempotente), si hay Postgres configurado.
  4. Imprime lo que hizo.

Sin Postgres configurado solo hace 1, 2 y 4: sirve para probar credenciales y filtros sin
tocar la base.

Códigos de salida (para que un cron u orquestador pueda distinguirlos):
  0  correcto      2  configuración inválida   4  error de la Gmail API
  1  inesperado    3  autenticación            5  red o base de datos
"""
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from . import config as configuracion
from . import registro, salida
from .autenticacion import construir_credenciales
from .busqueda import buscar_ids
from .cliente_gmail import construir_servicio
from .descarga import DocumentoNoDisponible, descargar
from .documento import parsear, resumen_por_seccion
from .errores import ErrorAplicacion
from .extraccion import CorreoDescartado, detectar
from .mensaje import obtener_completo
from .repositorio import Repositorio

logger = logging.getLogger("gmail-boletin")


def _en_horario(config) -> bool:
    """¿Toca revisar ahora? Sin BOLETIN_HORAS_ACTIVAS, siempre."""
    if config.horas_activas is None:
        return True
    inicio, fin = config.horas_activas
    return inicio <= datetime.now(config.huso).hour <= fin


def _una_pasada(config) -> None:
    credenciales = construir_credenciales(config)
    servicio = construir_servicio(credenciales)

    salida.encabezado(config.query, config.zona, config.ingesta_activa)

    detectados = []
    descartados = []
    for mensaje_id in buscar_ids(servicio, config.query, config.max_resultados):
        # format='full' es obligatorio acá: el enlace y la fecha están en el CUERPO, no en
        # las cabeceras, así que los metadatos no bastan.
        correo = obtener_completo(servicio, mensaje_id, config.huso)
        cuerpo = correo.cuerpo.texto if correo.cuerpo else ""
        try:
            boletin = detectar(
                mensaje_id=correo.id,
                remitente=correo.remitente,
                texto=f"{correo.asunto}\n{cuerpo}",
                fecha_recepcion=correo.fecha.date() if correo.fecha else None,
                hosts_permitidos=config.hosts_permitidos,
                remitentes_permitidos=config.remitentes_permitidos,
            )
        except CorreoDescartado as motivo:
            descartados.append((correo, str(motivo)))
            continue
        detectados.append(boletin)

    # Más reciente primero, que es como se leen.
    detectados.sort(key=lambda b: b.fecha, reverse=True)
    salida.detectados(detectados)
    salida.descartados(descartados)

    if not config.ingesta_activa:
        salida.resumen_sin_ingesta(len(detectados))
        return

    with Repositorio(config.postgres) as repositorio:
        resultado = repositorio.guardar(detectados)
        secciones = _traer_noticias(repositorio, detectados, config)
    salida.resumen_ingesta(len(detectados), resultado)
    salida.secciones(secciones)


def _traer_noticias(repositorio, boletines, config):
    """Descarga y parsea el documento de los boletines que aún no tienen sus noticias.

    Solo se baja lo que falta: el documento pesa ~480 KB y en la revisión de cada media
    hora la respuesta normal es «ya están todas», así que no se pide nada.

    Un documento que no se pueda traer NO rompe la corrida: el enlace al boletín completo
    sigue guardado y sirviendo. Perder el desglose de un día es molesto; que el servicio
    muera y no se registre el boletín siguiente es peor.
    """
    secciones = []
    for boletin in boletines:
        boletin_id, ya_tiene = repositorio.id_y_noticias(boletin.fecha)
        if boletin_id is None or ya_tiene:
            continue
        try:
            html = descargar(boletin.url, config.hosts_permitidos)
        except DocumentoNoDisponible as motivo:
            logger.warning("Boletín del %s: %s", boletin.fecha, motivo)
            continue
        noticias = parsear(html)
        if not noticias:
            logger.warning(
                "Boletín del %s: el documento no tenía noticias reconocibles "
                "(¿cambió el formato del proveedor?).", boletin.fecha,
            )
            continue
        repositorio.guardar_noticias(boletin_id, noticias)
        secciones.append((boletin.fecha, resumen_por_seccion(noticias), len(noticias)))
    return secciones


def main() -> int:
    # Ruta EXPLÍCITA y no find_dotenv(): find_dotenv camina la pila de frames para
    # adivinar desde dónde buscar, y revienta cuando no hay archivo llamante (un
    # `python -c`, un intérprete embebido). Acá el .env siempre está junto al Dockerfile.
    #
    # override=False: si la variable ya viene del entorno (docker compose, Kubernetes),
    # gana esa. El .env es la comodidad del desarrollo, no la autoridad en producción —
    # de hecho la imagen NO lo incluye (está en .dockerignore).
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env", override=False)

    try:
        config = configuracion.cargar()
    except ErrorAplicacion as error:
        # Todavía no hay logging configurado (el nivel sale de la config que falló).
        print(f"ERROR de configuración: {error}", file=sys.stderr)
        return error.codigo_salida

    registro.configurar(config.nivel_log)
    logger.info(
        "Inicio · búsqueda=%s · máximo=%s · ingesta=%s · zona=%s",
        config.query,
        config.max_resultados or "todos",
        "sí" if config.ingesta_activa else "no",
        config.zona,
    )

    while True:
        try:
            if _en_horario(config):
                _una_pasada(config)
            else:
                inicio, fin = config.horas_activas
                logger.info(
                    "Fuera de la franja de revisión (%02d:00-%02d:59 %s); no se consulta.",
                    inicio, fin, config.zona,
                )
        except ErrorAplicacion as error:
            logger.error("%s", error)
            if config.intervalo_segundos <= 0:
                return error.codigo_salida
            # En modo repetido, un fallo puntual (red, cuota) no debe matar el
            # contenedor: se reintenta en el siguiente ciclo.
            logger.warning("Se reintentará en %d s.", config.intervalo_segundos)
        except KeyboardInterrupt:
            logger.info("Interrumpido.")
            return 0
        except Exception:  # noqa: BLE001 - red de seguridad del proceso
            # exc_info pasa por el filtro de secretos igual que el mensaje.
            logger.exception("Fallo inesperado.")
            if config.intervalo_segundos <= 0:
                return 1

        if config.intervalo_segundos <= 0:
            return 0
        logger.info("Siguiente revisión en %d s.", config.intervalo_segundos)
        try:
            time.sleep(config.intervalo_segundos)
        except KeyboardInterrupt:
            logger.info("Interrumpido.")
            return 0


if __name__ == "__main__":
    sys.exit(main())
