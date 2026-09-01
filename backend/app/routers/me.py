"""GET /api/me — identidad y rol de la sesión actual.

Router propio SIN prefijo, montado aparte en main.py. No intentar colgarlo del
router de auth con un path tipo "/../me": Starlette no normaliza ".." en los paths
registrados, así que quedaría en 404 y la puerta del frontend interpretaría eso como
"backend caído" en vez de "sin sesión".
"""
from fastapi import APIRouter, Depends, Response

from ..dependencias import Sesion, exigir_configuracion, obtener_sesion
from ..schemas import SesionOut

router = APIRouter(dependencies=[Depends(exigir_configuracion)])


@router.get("/api/me", response_model=SesionOut)
def yo(response: Response, sesion: Sesion = Depends(obtener_sesion)) -> dict:
    # no-store es obligatorio, no cosmético: si un proxy cachea un 200 de este
    # endpoint, un usuario ve la identidad de otro.
    response.headers["Cache-Control"] = "no-store"
    return {
        "usuario": sesion.usuario,
        "email": sesion.email,
        "rol": sesion.rol,
        "esAdmin": sesion.es_admin,
        "expiraEn": sesion.expira_en,
    }
