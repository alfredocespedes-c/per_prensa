"""Modelos de respuesta Pydantic. `EstadoNoticiasOut` reproduce el shape de
noticias.json (ver collector/src/puertos/repositorio-de-noticias.js) para que
frontend/src/datos.js pueda apuntar a este endpoint sin más cambios que la URL.
"""
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .servicios import boletin_contratado as reglas_boletin
from .servicios.conceptos import normalizar_concepto


class ExtractoFragmento(BaseModel):
    texto: str
    resaltado: bool


class SeccionOut(BaseModel):
    id: str
    nombre: str
    orden: int


class NoticiaPublicaOut(BaseModel):
    """La noticia tal como la ve un anónimo en la portada: una ficha de referencia.

    Contiene lo necesario para citar la nota y llegar a ella, y NADA del contenido del
    medio. `model_config` con `extra="forbid"` no es decoración: convierte esta clase en
    una compuerta real. Si alguien agrega `extracto` al diccionario de la superficie
    pública por descuido, la validación falla en los tests en vez de publicarlo.
    """
    model_config = ConfigDict(extra="forbid")

    id: str
    url: str
    medioId: str
    medioNombre: str
    seccionId: str
    titular: str
    fecha: Optional[datetime]
    fechaDeteccion: datetime
    fechaReal: Optional[datetime]
    # Sin campo de imagen: el sistema dejó de tratarlas por decisión del departamento
    # legal. `extra="forbid"` de arriba convierte esta ausencia en una guarda: si alguien
    # volviera a añadir "imagen" al retorno de mapeo.py, la validación falla en vez de
    # publicarla.
    # Nivel 1 de la jerarquía del boletín. Puede ser None: los ítems que entran por la
    # búsqueda de Google no siempre contienen el concepto literal en titular o extracto.
    conceptoPrincipal: Optional[str] = None


class NoticiaOut(NoticiaPublicaOut):
    """La noticia completa, solo tras el login del IAM."""
    # Nombre de quien firma: dato personal, se atribuye solo puertas adentro.
    autor: Optional[str]
    extracto: list[ExtractoFragmento]
    eventId: Optional[str]
    analisis: Optional[dict[str, Any]]
    conceptosDetectados: list[str] = []
    # Con default para que un backend nuevo contra una fila vieja (antes de que corra
    # la migración) no rompa la validación.
    excluida: bool = False
    excluidaPor: list[str] = []


class ConceptoDelBoletinOut(BaseModel):
    """Nivel 1 de la jerarquía, con el orden que define el admin.

    Solo viajan los conceptos CON noticias en la ventana: la lista completa revelaría qué
    se vigila sin resultados.
    """
    texto: str
    orden: int


class EstadoPublicoOut(BaseModel):
    # Optional porque una base recién creada (antes de la primera corrida del
    # collector) no tiene fila en coleccion_metadatos todavía.
    generadoEn: Optional[datetime]
    tamanoVentana: int
    secciones: list[SeccionOut]
    conceptos: list[ConceptoDelBoletinOut] = []
    noticias: list[NoticiaPublicaOut]


class EstadoNoticiasOut(EstadoPublicoOut):
    noticias: list[NoticiaOut]


class HistoricoPageOut(BaseModel):
    pagina: int
    tamanoPagina: int
    total: int
    resultados: list[NoticiaOut]


# --- Conceptos (v3) -----------------------------------------------------------
# La normalización y los límites viven en servicios/conceptos.py para poder testearlos
# sin levantar la app; acá solo se invocan.

TipoConcepto = Literal["incluir", "excluir"]


class ConceptoOut(BaseModel):
    id: int
    texto: str
    tipo: TipoConcepto
    activo: bool
    creadoEn: datetime
    creadoPor: Optional[str]
    actualizadoEn: datetime
    actualizadoPor: Optional[str]
    # Nivel 1: posición en el boletín. Entero explícito, nunca derivado del orden de
    # inserción ni alfabético.
    orden: int = 0
    # Nivel 2: tipos de medio ocultos DENTRO de este concepto. El orden de los tipos es
    # global (SeccionOut.orden); acá solo va la visibilidad.
    tiposOcultos: list[str] = []


class OrdenItem(BaseModel):
    """Una posición del reordenamiento masivo. `id` es int (conceptos) o str (secciones)."""
    id: str
    orden: int


class OrdenIn(BaseModel):
    items: list[OrdenItem]


class TiposOcultosIn(BaseModel):
    """Lista COMPLETA de tipos ocultos para un concepto (reemplaza, no acumula)."""
    tiposOcultos: list[str]


class ConceptosOut(BaseModel):
    conceptos: list[ConceptoOut]
    # Catálogo del nivel 2 con su orden global, para que la UI pueda pintar el árbol sin
    # una segunda petición.
    secciones: list[SeccionOut] = []
    # Momento en que la próxima corrida del collector aplicará los cambios (cron
    # horario en minuto :00). En UTC: el frontend lo formatea a hora de Chile.
    proximaAplicacion: datetime
    # Si el rol del usuario puede escribir, para que el frontend no re-derive el rol.
    editable: bool


class ConceptoIn(BaseModel):
    texto: str
    tipo: TipoConcepto

    @field_validator("texto")
    @classmethod
    def _normalizar(cls, valor: str) -> str:
        return normalizar_concepto(valor)


class ConceptoPatch(BaseModel):
    texto: Optional[str] = None
    tipo: Optional[TipoConcepto] = None
    activo: Optional[bool] = None

    @field_validator("texto")
    @classmethod
    def _normalizar(cls, valor: Optional[str]) -> Optional[str]:
        return None if valor is None else normalizar_concepto(valor)


class ImpactoConcepto(BaseModel):
    concepto: str
    ocultas: int


class TitularOculto(BaseModel):
    id: str
    url: str
    titular: str
    medioNombre: str
    fecha: Optional[datetime]


class ImpactoOut(BaseModel):
    """Cuántas noticias oculta cada concepto excluido, y cuáles.

    Es la mitigación del riesgo que más importa a SECOM: una exclusión mal escrita
    puede ocultar cobertura legítima en silencio. Acá el admin lo ve literalmente.
    """
    porConcepto: list[ImpactoConcepto]
    titulares: list[TitularOculto]


# --- Retiros -----------------------------------------------------------------
# El formulario es PÚBLICO, así que estos schemas son la primera línea de defensa contra
# lo que llegue por ahí: los largos máximos evitan que un POST anónimo escriba megabytes
# en la base.

AmbitoRetiro = Literal["noticia", "medio"]
EstadoRetiro = Literal["pendiente", "aplicado", "rechazado"]


class RetiroIn(BaseModel):
    ambito: AmbitoRetiro
    clave: str = Field(min_length=1, max_length=500)
    solicitante: Optional[str] = Field(default=None, max_length=200)
    contacto: Optional[str] = Field(default=None, max_length=200)
    motivo: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("clave")
    @classmethod
    def _limpiar(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("Indique la dirección de la nota o el medio.")
        return limpio


class RetiroPatch(BaseModel):
    """Lo que puede cambiar un admin al resolver una solicitud.

    `clave` es editable a propósito: el formulario público lo rellena un medio, que
    escribirá su dominio ("ejemplo.cl") y no el identificador interno del recolector. El
    admin normaliza al aplicar, y así el filtro de lectura sigue siendo un NOT IN exacto
    en vez de un emparejamiento difuso en cada carga de la portada.
    """
    estado: Optional[EstadoRetiro] = None
    clave: Optional[str] = Field(default=None, min_length=1, max_length=500)


class RetiroOut(BaseModel):
    id: int
    ambito: AmbitoRetiro
    clave: str
    estado: EstadoRetiro
    solicitante: Optional[str]
    contacto: Optional[str]
    motivo: Optional[str]
    creadoEn: datetime
    aplicadoEn: Optional[datetime]
    aplicadoPor: Optional[str]


class RetirosOut(BaseModel):
    retiros: list[RetiroOut]


class RetiroCreadoOut(BaseModel):
    """Respuesta del POST público.

    Deliberadamente NO devuelve el id ni el estado: quien envía el formulario no está
    autenticado, y darle un identificador consultable abriría una vía para enumerar las
    solicitudes de otros.
    """
    recibida: bool


# --- Boletín del servicio contratado -----------------------------------------
# Solo el ENLACE. Ningún campo de estos schemas lleva contenido del boletín: ni titulares,
# ni extractos, ni imágenes. `BoletinContratadoOut` con extra="forbid" es la compuerta que
# lo mantiene así — si alguien añadiera `html` al diccionario de salida, la validación
# falla en los tests en vez de publicarlo. Mismo mecanismo que NoticiaPublicaOut.


class BoletinContratadoIn(BaseModel):
    """Lo que pega un admin. La validación fina vive en servicios/boletin_contratado.py.

    Los ValueError de esos validadores salen como 422 con el mensaje visible para el
    admin, igual que RetiroIn._limpiar.
    """
    fecha: date
    url: str = Field(min_length=1, max_length=reglas_boletin.LARGO_MAX)

    @field_validator("url")
    @classmethod
    def _validar_url(cls, valor: str) -> str:
        # Se guarda la forma canónica, no lo tecleado: normalizar_enlace reconstruye la
        # URL desde el host y la ruta ya validados.
        return reglas_boletin.normalizar_enlace(valor).url

    @field_validator("fecha")
    @classmethod
    def _validar_fecha(cls, valor: date) -> date:
        return reglas_boletin.validar_fecha(valor)


class NoticiaBoletinOut(BaseModel):
    """Una noticia del boletín del proveedor: REFERENCIA, no reproducción.

    `extra="forbid"` es la compuerta de la decisión: si alguien añadiera `extracto` al
    diccionario de salida, la validación falla en los tests en vez de publicar dos líneas
    del texto del medio. Mismo mecanismo que NoticiaPublicaOut.
    """
    model_config = ConfigDict(extra="forbid")

    titular: str
    medio: str
    fecha: Optional[date]
    pagina: str
    ambito: str
    # Enlace que el propio boletín pone en ese titular. Se abre en el sitio del proveedor.
    url: str


class SeccionBoletinOut(BaseModel):
    """Concepto + tipo de medio, en el ORDEN DEL DOCUMENTO (nunca alfabético)."""
    concepto: str
    tipo: str
    noticias: list[NoticiaBoletinOut]


class BoletinContratadoOut(BaseModel):
    """Lo que ve un usuario `general`: el enlace y su fecha, nada más.

    DOS clases y no una con campos opcionales. Con campos opcionales, Pydantic serializa
    igual las claves ausentes como `null` y la carga útil del rol `general` termina
    anunciando `registradoPor` — el dato no viaja, pero la forma sí, y la aserción de
    claves exactas que protege la decisión deja de poder escribirse.
    """
    model_config = ConfigDict(extra="forbid")

    id: int
    fecha: date
    url: str
    documentoId: str
    proveedor: str
    # Desglose por secciones. Vacío mientras el documento no se haya procesado: la portada
    # cae entonces al enlace al boletín completo, que siempre está.
    secciones: list[SeccionBoletinOut] = []


class BoletinContratadoAdminOut(BoletinContratadoOut):
    """Superconjunto estricto: añade los datos de OPERACIÓN, solo para admin."""

    origen: str
    registradoEn: datetime
    registradoPor: Optional[str]
    actualizadoEn: datetime
    actualizadoPor: Optional[str]


class BoletinContratadoActualOut(BaseModel):
    """`null` cuando todavía no se ha registrado ninguno.

    Nunca un 404: obligaría al cliente a distinguir "aún no hay boletín" de "el endpoint
    se cayó", y ensuciaría la consola cada mañana antes de que el admin pegue el enlace.
    """
    boletin: Optional[BoletinContratadoOut]


class BoletinContratadoActualAdminOut(BaseModel):
    boletin: Optional[BoletinContratadoAdminOut]


class BoletinesContratadosOut(BaseModel):
    boletines: list[BoletinContratadoAdminOut]


class BoletinContratadoGuardadoOut(BaseModel):
    boletin: BoletinContratadoAdminOut
    # Aviso no bloqueante (identificador que retrocede). Ver reglas_boletin.
    aviso: Optional[str] = None


# --- Derechos del titular sobre datos personales ------------------------------


class CoincidenciaDatosOut(BaseModel):
    id: str
    url: str
    titular: str
    medioNombre: str
    fecha: Optional[datetime]
    # En qué campos aparece el nombre: 'autor' | 'titular' | 'extracto' |
    # 'analisis.personas'. Permite al admin decidir con criterio antes de suprimir.
    campos: list[str]


class DatosPersonalesOut(BaseModel):
    nombre: str
    total: int
    truncado: bool
    coincidencias: list[CoincidenciaDatosOut]


class SupresionOut(BaseModel):
    nombre: str
    borradas: int


class SesionOut(BaseModel):
    """Identidad de la sesión actual (GET /api/me).

    `rol` en castellano aunque el IAM lo llame `role`: la traducción ocurre en un
    único punto (el callback). `esAdmin` va precalculado para que el frontend no
    tenga que conocer la lista ROLES_ADMIN.
    """
    usuario: str
    email: str
    rol: str
    esAdmin: bool
    expiraEn: int          # epoch del tope absoluto


class HealthOut(BaseModel):
    status: str
    db: str
    ultimaColecta: Optional[datetime] = None
    minutosDesdeUltimaColecta: Optional[float] = None
    # Nombres (no motivos) de las variables de autenticación que faltan. Permite
    # diagnosticar un despliegue incompleto sin entrar al contenedor; el detalle va
    # solo al log (SEC-07).
    configuracion: Optional[list[str]] = None
