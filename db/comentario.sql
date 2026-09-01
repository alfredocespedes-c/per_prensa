-- ============================================================
-- COMENTARIOS DE TABLAS
-- ============================================================

COMMENT ON TABLE secciones IS
'Catálogo de secciones o categorías desde las cuales se obtienen las noticias recolectadas.';

COMMENT ON TABLE noticias IS
'Repositorio histórico de noticias recolectadas, enriquecidas mediante análisis y clasificadas por sección, medio y atributos derivados.';

COMMENT ON TABLE coleccion_metadatos IS
'Metadatos de la última ejecución del proceso de recolección de noticias. Contiene información de la ventana procesada y la fecha efectiva de generación.';


-- ============================================================
-- COMENTARIOS TABLA secciones
-- ============================================================

COMMENT ON COLUMN secciones.id IS
'Identificador único de la sección.';

COMMENT ON COLUMN secciones.nombre IS
'Nombre descriptivo de la sección.';

COMMENT ON COLUMN secciones.orden IS
'Orden de presentación de la sección en la interfaz.';


-- ============================================================
-- COMENTARIOS TABLA noticias
-- ============================================================

COMMENT ON COLUMN noticias.id IS
'Identificador único de la noticia. Corresponde a la URL canónica utilizada como clave primaria.';

COMMENT ON COLUMN noticias.url IS
'URL original de la noticia publicada por el medio.';

COMMENT ON COLUMN noticias.medio_id IS
'Identificador interno del medio de comunicación.';

COMMENT ON COLUMN noticias.medio_nombre IS
'Nombre del medio de comunicación que publicó la noticia.';

COMMENT ON COLUMN noticias.seccion_id IS
'Sección a la que pertenece la noticia.';

COMMENT ON COLUMN noticias.titular IS
'Título principal de la noticia.';

COMMENT ON COLUMN noticias.fecha IS
'Fecha de publicación informada por el medio de comunicación.';

COMMENT ON COLUMN noticias.fecha_deteccion IS
'Fecha y hora en que la noticia fue detectada por el sistema recolector.';

COMMENT ON COLUMN noticias.extracto IS
'Extracto textual de la noticia almacenado en formato JSON, incluyendo segmentos resaltados cuando corresponda.';

-- La columna `noticias.imagen` fue eliminada por decisión del departamento legal: el
-- sistema dejó de tratar imágenes de noticias. No reintroducirla.

COMMENT ON COLUMN noticias.autor IS
'Autor de la noticia cuando la información está disponible.';

COMMENT ON COLUMN noticias.fecha_real IS
'Fecha de publicación normalizada o corregida durante el proceso de análisis.';

COMMENT ON COLUMN noticias.event_id IS
'Identificador del evento al que fue asociada la noticia durante el proceso de agrupamiento.';

COMMENT ON COLUMN noticias.analisis IS
'Resultado completo del análisis automatizado almacenado en formato JSON.';

COMMENT ON COLUMN noticias.sentimiento IS
'Clasificación del sentimiento detectado en la noticia.';

COMMENT ON COLUMN noticias.riesgo IS
'Nivel de riesgo estimado a partir del análisis de contenido.';

COMMENT ON COLUMN noticias.prioridad IS
'Prioridad asignada por el motor de análisis para efectos de seguimiento.';

COMMENT ON COLUMN noticias.importancia IS
'Nivel de importancia asignado automáticamente a la noticia.';

COMMENT ON COLUMN noticias.ambito IS
'Ámbito geográfico o temático identificado durante el análisis.';

COMMENT ON COLUMN noticias.categorias IS
'Listado de categorías temáticas asociadas a la noticia.';

COMMENT ON COLUMN noticias.regiones IS
'Listado de regiones geográficas asociadas a la noticia.';

COMMENT ON COLUMN noticias.primera_vista_en IS
'Fecha y hora en que la noticia fue almacenada por primera vez en la base de datos.';

COMMENT ON COLUMN noticias.actualizada_en IS
'Fecha y hora de la última actualización del registro.';


-- ============================================================
-- COMENTARIOS TABLA coleccion_metadatos
-- ============================================================

COMMENT ON COLUMN coleccion_metadatos.id IS
'Identificador único del registro de metadatos. Siempre toma el valor 1.';

COMMENT ON COLUMN coleccion_metadatos.generado_en IS
'Fecha y hora efectiva de generación del conjunto de noticias.';

COMMENT ON COLUMN coleccion_metadatos.tamano_ventana IS
'Cantidad de noticias consideradas en la ventana de procesamiento más reciente.';

COMMENT ON COLUMN coleccion_metadatos.actualizado_en IS
'Fecha y hora de la última actualización de los metadatos.';


-- ============================================================
-- COMENTARIOS DE ÍNDICES
-- ============================================================

COMMENT ON INDEX idx_noticias_fecha IS
'Índice para consultas cronológicas por fecha de publicación.';

COMMENT ON INDEX idx_noticias_medio IS
'Índice para consultas por medio de comunicación.';

COMMENT ON INDEX idx_noticias_seccion IS
'Índice para consultas por sección.';

COMMENT ON INDEX idx_noticias_evento IS
'Índice parcial para consultas por identificador de evento.';

COMMENT ON INDEX idx_noticias_categ IS
'Índice GIN para búsquedas eficientes sobre las categorías asociadas a las noticias.';

COMMENT ON INDEX idx_noticias_region IS
'Índice GIN para búsquedas eficientes sobre las regiones asociadas a las noticias.';


-- ============================================================
-- COMENTARIOS DE RESTRICCIONES
-- ============================================================

COMMENT ON CONSTRAINT coleccion_metadatos_pkey ON coleccion_metadatos IS
'Garantiza la existencia de un único registro de metadatos.';

COMMENT ON CONSTRAINT coleccion_metadatos_id_check ON coleccion_metadatos IS
'Restringe el identificador al valor 1 para mantener una única fila de metadatos.';

COMMENT ON CONSTRAINT noticias_seccion_id_fkey ON noticias IS
'Garantiza que cada noticia pertenezca a una sección existente.';


-- ============================================================
-- COMENTARIOS TABLA colecta_ejecuciones
-- ============================================================

COMMENT ON TABLE colecta_ejecuciones IS
'Bitácora de corridas del proceso recolector: una fila por cada activación del cron horario. Permite auditar que el collector se ejecutó cada hora y qué recolectó en cada corrida.';

COMMENT ON COLUMN colecta_ejecuciones.id IS
'Identificador secuencial de la corrida.';

COMMENT ON COLUMN colecta_ejecuciones.iniciada_en IS
'Fecha y hora de inicio de la corrida.';

COMMENT ON COLUMN colecta_ejecuciones.finalizada_en IS
'Fecha y hora en que se registró la corrida (fin efectivo).';

COMMENT ON COLUMN colecta_ejecuciones.duracion_ms IS
'Duración total de la corrida en milisegundos.';

COMMENT ON COLUMN colecta_ejecuciones.exito IS
'Indica si al menos una fuente entregó datos durante la corrida.';

COMMENT ON COLUMN colecta_ejecuciones.noticias_publicadas IS
'Cantidad de noticias en la ventana publicada tras fusionar el estado.';

COMMENT ON COLUMN colecta_ejecuciones.noticias_nuevas IS
'Cantidad de noticias detectadas como nuevas en esta corrida.';

COMMENT ON COLUMN colecta_ejecuciones.noticias_previas IS
'Cantidad de noticias que provenían del estado anterior.';

COMMENT ON COLUMN colecta_ejecuciones.pasos_ok IS
'Número de pasos/fuentes que finalizaron correctamente (líneas [OK] del resumen).';

COMMENT ON COLUMN colecta_ejecuciones.pasos_fallidos IS
'Número de pasos/fuentes que fallaron (líneas [FALLO] del resumen).';

COMMENT ON COLUMN colecta_ejecuciones.resumen IS
'Detalle por fuente/paso de la corrida en formato JSON (resumen textual verbatim).';

COMMENT ON INDEX idx_colecta_ejecuciones_inicio IS
'Índice para consultar las corridas más recientes por fecha de inicio.';