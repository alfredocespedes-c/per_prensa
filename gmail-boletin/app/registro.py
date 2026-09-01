"""Logging con redacción de secretos.

POR QUÉ NO BASTA "cuidado al escribir logs". Los secretos no se filtran porque alguien
los imprima a propósito: se filtran dentro del `repr` de una excepción de una librería de
terceros, en un traceback, o en un mensaje de error de la API que incluye el cuerpo de la
petición. Solo algo que actúe sobre TODO lo que sale evita depender de la disciplina de
quien escribe cada línea.

POR QUÉ EN EL FORMATEADOR Y NO SOLO EN UN FILTRO. Un `logging.Filter` corre ANTES del
formateo, y en ese momento `record.exc_text` todavía es None: lo rellena el formateador al
llamar a formatException(). Un filtro que intente limpiar `exc_text` no limpia nada, y el
traceback —justo donde acaban los secretos en la vida real— sale íntegro. Verificado: con
solo el filtro, un `logger.exception()` con el refresh token dentro del mensaje de la
excepción lo imprimía completo. Por eso la limpieza definitiva ocurre en el formateador,
sobre la cadena ya montada. El filtro se conserva para que el propio LogRecord viaje
limpio hacia cualquier otro handler.
"""
import logging
import os
import sys

# Variables cuyo VALOR jamás puede aparecer en la salida.
_VARIABLES_SECRETAS = ("GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN")
_MASCARA = "***REDACTADO***"
# Por debajo de esto, un "secreto" es tan corto que buscarlo destrozaría texto legítimo.
_LARGO_MINIMO = 8


def secretos_del_entorno() -> list[str]:
    valores = []
    for nombre in _VARIABLES_SECRETAS:
        valor = (os.environ.get(nombre) or "").strip()
        if len(valor) >= _LARGO_MINIMO:
            valores.append(valor)
    # De más largo a más corto: si un secreto contuviera a otro, se enmascara primero el
    # grande y no queda un fragmento suelto del pequeño.
    return sorted(set(valores), key=len, reverse=True)


def redactar(texto: str, secretos) -> str:
    for secreto in secretos:
        if secreto in texto:
            texto = texto.replace(secreto, _MASCARA)
    return texto


class FiltroSecretos(logging.Filter):
    """Limpia el mensaje del LogRecord. NO alcanza al traceback (ver el docstring)."""

    def __init__(self, secretos=None) -> None:
        super().__init__()
        self._secretos = list(secretos) if secretos is not None else secretos_del_entorno()

    def filter(self, registro: logging.LogRecord) -> bool:
        if not self._secretos:
            return True
        try:
            mensaje = registro.getMessage()
        except Exception:  # noqa: BLE001 - un log roto no puede tumbar la app
            mensaje = str(registro.msg)
        # Se anulan los args: si el secreto viniera en uno, formatear después lo
        # reintroduciría en la cadena ya limpia.
        registro.msg = redactar(mensaje, self._secretos)
        registro.args = ()
        return True


class FormateadorSeguro(logging.Formatter):
    """Redacta sobre la cadena FINAL: mensaje, traceback y pila, todo junto."""

    def __init__(self, *args, secretos=None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._secretos = list(secretos) if secretos is not None else secretos_del_entorno()

    def format(self, registro: logging.LogRecord) -> str:
        return redactar(super().format(registro), self._secretos)


def configurar(nivel: str = "INFO") -> logging.Logger:
    # Se resuelven UNA vez y se comparten: el entorno no cambia durante la ejecución y
    # así filtro y formateador no pueden desincronizarse.
    secretos = secretos_del_entorno()

    manejador = logging.StreamHandler(sys.stderr)
    manejador.setFormatter(
        FormateadorSeguro(
            "%(asctime)s %(levelname)-7s %(name)s: %(message)s", secretos=secretos
        )
    )
    manejador.addFilter(FiltroSecretos(secretos))

    raiz = logging.getLogger()
    raiz.handlers.clear()
    raiz.addHandler(manejador)
    raiz.setLevel(getattr(logging, nivel.upper(), logging.INFO))

    # googleapiclient avisa en cada arranque de que no cachea el discovery. Es
    # deliberado (cache_discovery=False), así que el aviso es ruido.
    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
    return logging.getLogger("gmail-boletin")
