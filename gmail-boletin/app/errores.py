"""Errores propios de la aplicación.

Existen para que `__main__` pueda distinguir QUÉ falló y devolver un código de salida
distinto en cada caso, en vez de un traceback genérico. En un contenedor sin nadie
delante, el código de salida y la primera línea del log son todo lo que se ve.

Ninguno de estos errores debe construirse con el valor de un secreto en el mensaje.
"""


class ErrorAplicacion(Exception):
    """Raíz de los errores esperables. Trae un código de salida asociado."""

    codigo_salida = 1


class ConfiguracionInvalida(ErrorAplicacion):
    """Falta una variable de entorno o tiene un valor imposible."""

    codigo_salida = 2


class ErrorAutenticacion(ErrorAplicacion):
    """El refresh token no sirve: revocado, caducado o de otro cliente OAuth."""

    codigo_salida = 3


class ErrorGmail(ErrorAplicacion):
    """La Gmail API respondió con un error (permisos, cuota, 5xx)."""

    codigo_salida = 4


class ErrorRed(ErrorAplicacion):
    """No se pudo hablar con Google: DNS, proxy, timeout, TLS."""

    codigo_salida = 5
