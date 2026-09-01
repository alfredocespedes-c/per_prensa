"""schemas.py: el contrato Pydantic que valida lo que sale hacia el frontend."""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas import EstadoNoticiasOut, HealthOut, NoticiaOut


def _noticia_valida(**sobrescribe):
    base = dict(
        id="https://mediouno.cl/nota-1",
        url="https://mediouno.cl/nota-1",
        medioId="medio-uno",
        medioNombre="Medio Uno",
        seccionId="digital",
        titular="CONAF anuncia plan",
        fecha=datetime(2026, 8, 1, 12, tzinfo=timezone.utc),
        fechaDeteccion=datetime(2026, 8, 1, 13, tzinfo=timezone.utc),
        extracto=[{"texto": "CONAF", "resaltado": True}],
        autor=None,
        fechaReal=None,
        eventId=None,
        analisis=None,
    )
    base.update(sobrescribe)
    return base


def test_noticia_valida_pasa():
    noticia = NoticiaOut(**_noticia_valida())
    assert noticia.extracto[0].resaltado is True


def test_fecha_puede_ser_nula_pero_fecha_deteccion_no():
    # Regla del collector: la fecha del medio es opcional; la de detección
    # siempre existe (es la que ordena en su ausencia).
    assert NoticiaOut(**_noticia_valida(fecha=None)).fecha is None
    with pytest.raises(ValidationError):
        NoticiaOut(**_noticia_valida(fechaDeteccion=None))


def test_extracto_malformado_no_pasa():
    with pytest.raises(ValidationError):
        NoticiaOut(**_noticia_valida(extracto=[{"texto": "sin resaltado"}]))


def test_estado_admite_base_vacia_pre_primera_corrida():
    estado = EstadoNoticiasOut(generadoEn=None, tamanoVentana=1000, secciones=[], noticias=[])
    assert estado.generadoEn is None


def test_health_tiene_defaults_para_los_campos_opcionales():
    salud = HealthOut(status="ok", db="ok")
    assert salud.ultimaColecta is None
    assert salud.minutosDesdeUltimaColecta is None
