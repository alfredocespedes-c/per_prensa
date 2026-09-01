"""Modelos SQLAlchemy de SOLO CONSULTA.

Estos modelos NO son la fuente de verdad del esquema — esa es db/schema.sql (ver
db/bootstrap.py). No llamar Base.metadata.create_all() en ningún lado: si este
archivo y el .sql alguna vez difieren, gana el .sql (es lo que realmente se ejecuta
contra Postgres).
"""
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Column,
    Computed,
    Date,
    DateTime,
    Integer,
    SmallInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Seccion(Base):
    __tablename__ = "secciones"

    id = Column(Text, primary_key=True)
    nombre = Column(Text, nullable=False)
    orden = Column(SmallInteger, nullable=False)


class Noticia(Base):
    __tablename__ = "noticias"

    id = Column(Text, primary_key=True)
    url = Column(Text, nullable=False)
    medio_id = Column(Text, nullable=False)
    medio_nombre = Column(Text, nullable=False)
    seccion_id = Column(Text, nullable=False)
    titular = Column(Text, nullable=False)
    fecha = Column(DateTime(timezone=True))
    fecha_deteccion = Column(DateTime(timezone=True), nullable=False)
    extracto = Column(JSONB, nullable=False)
    # No hay columna `imagen`: se eliminó del esquema (ver el bloque DO $$ al final de
    # db/schema.sql). El sistema dejó de tratar imágenes de noticias.
    autor = Column(Text)
    fecha_real = Column(DateTime(timezone=True))
    event_id = Column(Text)
    analisis = Column(JSONB)
    sentimiento = Column(Text)
    riesgo = Column(Text)
    prioridad = Column(SmallInteger)
    importancia = Column(SmallInteger)
    ambito = Column(Text)
    categorias = Column(ARRAY(Text))
    regiones = Column(ARRAY(Text))
    # Exclusión por marcado suave: el collector recalcula ambas columnas en cada
    # corrida (ver collector/src/dominio/exclusiones.js). El backend solo las lee.
    excluida = Column(Boolean, nullable=False)
    excluida_por = Column(ARRAY(Text), nullable=False)
    # Nivel 1 de la jerarquía del boletín: qué concepto hizo entrar la noticia. El
    # collector los recalcula en cada corrida (ver dominio/inclusiones.js).
    conceptos_detectados = Column(ARRAY(Text), nullable=False)
    concepto_principal = Column(Text)
    primera_vista_en = Column(DateTime(timezone=True), nullable=False)
    actualizada_en = Column(DateTime(timezone=True), nullable=False)


class Concepto(Base):
    """Conceptos de búsqueda y exclusión, editables por el rol admin.

    Es la primera tabla que este backend ESCRIBE por ORM (el resto es solo lectura).
    La regla que sigue vigente: nada de Base.metadata.create_all() — db/schema.sql es
    la única autoridad del esquema.
    """

    __tablename__ = "conceptos"

    id = Column(BigInteger, primary_key=True)
    texto = Column(Text, nullable=False)
    tipo = Column(Text, nullable=False)  # 'incluir' | 'excluir'
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(DateTime(timezone=True), nullable=False)
    creado_por = Column(Text)
    actualizado_en = Column(DateTime(timezone=True), nullable=False)
    actualizado_por = Column(Text)
    # Nivel 1 de la jerarquía del boletín: el orden que el admin define arrastrando.
    # Gobierna la presentación Y qué conceptos sobreviven al recorte de la consulta a
    # Google News (ver collector/src/adaptadores/repositorio-conceptos-postgres.js).
    orden = Column(Integer, nullable=False, default=0)
    # Computed(..., persisted=True) le dice a SQLAlchemy que la calcula el servidor:
    # sin esto intentaría INSERTARla y Postgres rechazaría el INSERT entero.
    texto_normalizado = Column(Text, Computed("", persisted=True))


class ConceptoTipoOculto(Base):
    """Un tipo de medio oculto DENTRO de un concepto.

    Tabla dispersa: solo existe fila para lo oculto, así que "todo visible" —el caso
    normal— no cuesta nada. El ORDEN de los tipos es global (`secciones.orden`); lo que
    es por concepto es la visibilidad.
    """

    __tablename__ = "concepto_tipo_oculto"

    concepto_id = Column(BigInteger, primary_key=True)
    seccion_id = Column(Text, primary_key=True)


class Retiro(Base):
    """Solicitud de retiro de una nota o de un medio completo.

    La crea cualquiera sin sesión; la APLICA un admin. Solo las filas en estado
    'aplicado' filtran contenido (ver servicios/retiros.py).
    """

    __tablename__ = "retiros"

    id = Column(BigInteger, primary_key=True)
    ambito = Column(Text, nullable=False)  # 'noticia' | 'medio'
    clave = Column(Text, nullable=False)   # URL canónica, o medio_id/dominio
    motivo = Column(Text)
    solicitante = Column(Text)
    contacto = Column(Text)
    estado = Column(Text, nullable=False, default="pendiente")
    creado_en = Column(DateTime(timezone=True), nullable=False)
    ip_origen = Column(Text)
    aplicado_en = Column(DateTime(timezone=True))
    aplicado_por = Column(Text)


class BoletinContratado(Base):
    """Enlace al boletín del servicio de monitoreo que CONAF tiene contratado.

    Solo el ENLACE: ni el HTML, ni los titulares, ni las imágenes que ese HTML incrusta.
    Ver el bloque correspondiente en db/schema.sql, que sigue siendo la única autoridad
    del esquema.

    `registrado_en` y `actualizado_en` se fijan SIEMPRE en Python al construir la fila,
    nunca por el DEFAULT now() del servidor: el mismo patrón que Retiro.creado_en (ver
    routers/retiros.py). Confiar en el default deja los campos en None hasta el refresh y
    rompe la validación de salida.
    """

    __tablename__ = "boletines_contratados"

    id = Column(BigInteger, primary_key=True)
    proveedor = Column(Text, nullable=False, default="simbiu")
    fecha = Column(Date, nullable=False)
    url = Column(Text, nullable=False)
    documento_id = Column(Text, nullable=False)
    # 'manual' hoy; 'correo' cuando exista el adaptador que lea el buzón. La columna es
    # la frontera: el camino de LECTURA no la mira nunca (no hay ningún `if origen ==`).
    origen = Column(Text, nullable=False, default="manual")
    registrado_en = Column(DateTime(timezone=True), nullable=False)
    registrado_por = Column(Text)
    registrado_sub = Column(Text)
    ip_origen = Column(Text)
    actualizado_en = Column(DateTime(timezone=True), nullable=False)
    actualizado_por = Column(Text)


class BoletinContratadoNoticia(Base):
    """Una noticia DENTRO del boletín contratado.

    Solo referencia: titular, medio, fecha, página y el enlace que el propio boletín pone
    en ese titular. Sin extracto y sin imágenes — ver el comentario de la tabla en
    db/schema.sql.
    """

    __tablename__ = "boletin_contratado_noticias"

    id = Column(BigInteger, primary_key=True)
    boletin_id = Column(BigInteger, nullable=False)
    orden = Column(Integer, nullable=False)
    concepto = Column(Text, nullable=False)
    tipo = Column(Text, nullable=False)
    ambito = Column(Text, nullable=False)
    titular = Column(Text, nullable=False)
    medio = Column(Text, nullable=False)
    fecha = Column(Date)
    pagina = Column(Text, nullable=False)
    url = Column(Text, nullable=False)


class ColeccionMetadatos(Base):
    __tablename__ = "coleccion_metadatos"

    id = Column(SmallInteger, primary_key=True)
    generado_en = Column(DateTime(timezone=True), nullable=False)
    tamano_ventana = Column(BigInteger, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), nullable=False)
