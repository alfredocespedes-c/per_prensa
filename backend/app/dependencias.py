"""Autorización de la API.

Contrato:
  - sin cookie de sesión válida   -> 401 {"detail": "sesion_requerida"}
  - con sesión pero rol no admin  -> 403 {"detail": "requiere_rol_admin"}
  - autenticación mal configurada -> 503 {"detail": "autenticacion_no_configurada"}

obtener_sesion NO consulta la base de datos ni al IAM: valida un HMAC sobre la
cookie y mira el reloj. Es deliberado y es lo que sostiene el requisito de SECOM de
que la página esté arriba a las 8:00 aunque el IAM esté caído.
"""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, Response, status

from . import config, seguridad


@dataclass(frozen=True)
class Sesion:
    sub: str
    usuario: str
    email: str
    rol: str
    app_id: int
    iniciada_en: int
    expira_en: int

    @property
    def es_admin(self) -> bool:
        return self.rol in config.ROLES_ADMIN


def _a_sesion(datos: dict) -> Sesion:
    return Sesion(
        sub=str(datos.get("sub", "")),
        usuario=str(datos.get("usuario", "")),
        email=str(datos.get("email", "")),
        rol=str(datos.get("rol", "")).strip().lower(),
        app_id=int(datos.get("app_id", 0) or 0),
        iniciada_en=int(datos.get("iniciada_en", 0) or 0),
        expira_en=int(datos.get("expira_en", 0) or 0),
    )


def exigir_configuracion() -> None:
    """Puerta de los endpoints de login.

    Se informan los NOMBRES de las variables que faltan, nunca el motivo ni el valor:
    los nombres ya son públicos en /health y hacen que un despliegue incompleto se
    diagnostique desde la propia pantalla en vez de tener que entrar al contenedor.
    """
    if not config.CONFIGURACION_OK:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "autenticacion_no_configurada",
                "faltan": config.FALTANTES,
            },
        )


def sesion_opcional(request: Request, response: Response) -> Sesion | None:
    datos = seguridad.verificar_sesion(request.cookies.get(seguridad.COOKIE_SESION, ""))
    if datos is None:
        return None
    if seguridad.debe_renovarse(datos):
        # Ventana deslizante: cada petición "viva" corre el vencimiento por
        # inactividad. Se re-emite como mucho una vez por hora para no mandar
        # Set-Cookie en cada respuesta.
        seguridad.poner_cookie_sesion(response, datos)
    return _a_sesion(datos)


def obtener_sesion(request: Request, response: Response) -> Sesion:
    sesion = sesion_opcional(request, response)
    if sesion is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="sesion_requerida",
            # La cookie muerta se borra acá y no con response.delete_cookie(): al
            # lanzar HTTPException, FastAPI descarta el Response inyectado.
            headers={
                "Cache-Control": "no-store",
                "Set-Cookie": seguridad.cabecera_borrar_sesion(),
            },
        )
    return sesion


def requerir_admin(sesion: Sesion = Depends(obtener_sesion)) -> Sesion:
    """Solo para la edición de conceptos.

    Cualquier otro rol —incluido "general", que es lo que el IAM devuelve a quien NO
    tiene asignación en esta app— queda en solo lectura.
    """
    if not sesion.es_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="requiere_rol_admin")
    return sesion


def requerir_admin_escritura(
    request: Request, sesion: Sesion = Depends(requerir_admin)
) -> Sesion:
    """requerir_admin + verificación de Origin en métodos inseguros.

    Defensa en profundidad sobre SameSite=Lax (que ya impide que un POST cross-site
    lleve la cookie). Los navegadores SIEMPRE mandan Origin en POST/PATCH/DELETE; si
    falta, es un cliente no-navegador (curl) y se deja pasar.
    """
    origen = (request.headers.get("Origin") or "").rstrip("/")
    if origen and config.ORIGENES_PERMITIDOS and origen not in config.ORIGENES_PERMITIDOS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="origen_no_permitido")
    return sesion
