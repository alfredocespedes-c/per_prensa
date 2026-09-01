// Parámetros operativos de la recolección.

// Tamaño de la ventana móvil de noticias publicadas (REQUISITOS.md §3.3:
// "~100", número referencial y configurable).
export const TAMANO_VENTANA = 1000

// Largo máximo (en caracteres) del extracto mostrado por noticia.
//
// 500 y no más: el extracto es lo ÚNICO del contenido del medio que este sistema
// almacena, y el principio rector del rediseño es no guardar ni mostrar más de lo que
// el medio expone deliberadamente. El cuerpo del artículo se procesa en memoria para
// detectar la mención y analizar, pero NUNCA se persiste (ver puertos/extractor-de-
// contenido.js). La ventana se centra en la primera mención, así que el fragmento
// guardado siempre la contiene: eso es lo que mantiene estable la reevaluación horaria
// de las exclusiones (ver dominio/exclusiones.js, textoDeFiltro).
export const LARGO_EXTRACTO = 500

// Timeout por feed. Un medio lento no debe frenar la corrida completa.
export const TIMEOUT_FEED_MS = 200_000

// User-Agent identificable: cortesía con los medios y facilidad de contacto.
export const USER_AGENT =
  'COIPO_PRENSA/1.0 (monitor de prensa CONAF; https://github.com/conaf/COIPO_PRENSA)'

// --- robots.txt ---
//
// Al declarar un User-Agent propio se asume también la regla que lo gobierna: pedir con
// nombre y desoír el robots.txt es peor que pedir en silencio.
//
// CONSECUENCIA CONOCIDA Y VERIFICADA (2026-08-11): news.google.com declara
// `User-agent: * / Disallow: /` con una lista blanca (/topics/, /stories/, /home…) que NO
// incluye `/rss/search` ni `/_/DotsSplashUi/data/batchexecute`. Con ROBOTS_ACTIVO=true, la
// Fuente 2 (Google News, la red de seguridad de cobertura) deja de traer ítems. Las
// fuentes 1 y 3 no se ven afectadas: los medios curados permiten sus feeds y sus notas.
//
// Es una decisión de cumplimiento, no un fallo. Ponerlo en false ignoraría el robots.txt
// de TODOS los medios; para casos puntuales existe ROBOTS_EXENTOS, más abajo.
export const ROBOTS_ACTIVO = true

// Orígenes eximidos de la comprobación de robots.txt, por decisión expresa del operador.
//
// Existe porque el interruptor ROBOTS_ACTIVO es demasiado grueso: apagarlo cambiaría el
// trato hacia los 63 medios chilenos, que publican sus feeds abiertamente y cuyos
// robots.txt no estorban, solo para destrabar UN origen. Esta lista deja el resto intacto
// y, sobre todo, deja por escrito a quién se exime y por qué — que es lo que permite
// auditarlo después.
//
// FUNDAMENTO de la exención vigente (decisión del responsable del proyecto, 2026-08-18):
// robots.txt no es una norma jurídica sino un convenio (RFC 9309); el uso que hace el
// sistema —titular, medio, fecha y enlace a la nota original— es el de menor exposición
// posible, y Google News existe precisamente para sindicar titulares y enlaces. Verificado
// el mismo día: el endpoint responde HTTP 200 con 100 ítems al User-Agent propio del
// proyecto, sin suplantar un navegador ni evadir ningún control.
//
// LO QUE ESTO NO AUTORIZA: seguir eximiendo por comodidad. Un medio que bloquea con WAF
// (El Naveghable, Sabes.cl) no se destraba desde acá y saltárselo sería evadir un control
// activo, no un convenio. Y los medios que prohíben una ruta CONCRETA (El Observador y
// País Circular niegan /feed/) están dando una señal dirigida, distinta del `Disallow: /`
// genérico de un servicio de sindicación: agregarlos acá es una decisión aparte que nadie
// ha tomado.
//
// COHERENCIA DOCUMENTAL: el correo de consulta a Fiscalía describe las medidas adoptadas.
// Si esta lista deja de estar vacía, esa descripción debe decirlo.
export const ROBOTS_EXENTOS = ['news.google.com']

// Cada cuánto se revalida el robots.txt de un dominio. La caché se persiste en el estado
// (campo `robotsCache`), hermana de resolucionesGoogle y sitemapVisto.
export const ROBOTS_TTL_HORAS = 24

// Espera entre peticiones a un mismo host cuando el medio NO declara Crawl-delay.
export const CRAWL_DELAY_POR_DEFECTO_MS = 0

// Tope al Crawl-delay declarado. Un medio con `Crawl-delay: 3600` haría que una sola nota
// consumiera la hora entera entre corridas; se respeta el espíritu (no atropellar) sin
// dejar que un valor extremo cuelgue la recolección.
export const CRAWL_DELAY_MAXIMO_MS = 10_000

// Red de seguridad de cobertura vía Google News. Captura medios fuera de la
// lista curada y noticias que el feed propio del medio ya rotó (ver
// docs/REQUISITOS.md, criterio de no perder medios grandes).
export const GOOGLE_NEWS_ACTIVO = true

// Parámetros de localización del feed de Google News (Chile, español).
export const GOOGLE_NEWS_PARAMS = { hl: 'es-419', gl: 'CL', ceid: 'CL:es-419' }

// Tope de resoluciones de enlaces por corrida (cada resolución = 2 peticiones al
// endpoint interno de Google). La caché evita re-resolver lo ya conocido, así
// que en régimen se resuelven pocos por corrida.
export const MAX_RESOLUCIONES_POR_CORRIDA = 900

// Dominios que NO son prensa y deben excluirse de la red de Google News. El
// propio sitio de CONAF domina la búsqueda con sus comunicados y no es
// monitoreo de prensa. Las redes sociales están fuera de alcance v1 (REQUISITOS).
// El admin puede sumar aquí otros (dominio sin "www.").
export const DOMINIOS_EXCLUIDOS = [
  'conaf.cl',
  'instagram.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'youtube.com',
]

// --- Fuente 3: sitemaps de noticias ---

// Activar la recolección vía sitemaps de noticias (config/medios.js: MEDIOS_SITEMAP).
// Al desactivar se conserva la caché sitemapVisto tal cual (no se re-procesa al volver).
export const SITEMAP_ACTIVO = true

// Tope de descargas de página por corrida para detectar menciones en el cuerpo.
// Meganoticias publica ~3 notas/hora; el arranque (~140 URLs del sitemap) drena en
// ~4 corridas sin perder nada porque el sitemap retiene ~48 h y las URLs no
// procesadas no se marcan como vistas.
export const MAX_DESCARGAS_SITEMAP_POR_CORRIDA = 40

// --- Enriquecimiento NLP (Fase 1) ---

// Activar pipeline de enriquecimiento (análisis de sentimiento, categorías, entidades, etc.).
export const ENRIQUECIMIENTO_ACTIVO = true

// Tope de descargas de contenido (texto + autor + fecha) por corrida. La ventana conserva
// el enriquecimiento de previas; se enriquecen solo las nuevas. En régimen, pocas por corrida.
export const MAX_DESCARGAS_POR_CORRIDA = 1000

// Versión del pipeline de análisis. Usado para re-enriquecer previas si la lógica cambia.
// Las previas con version < VERSION_ANALISIS se re-enriquecen sin red (con titular+extracto).
// v2: stopwords reescritas (la lista v1 dejaba pasar "que", "las", "los" como keywords).
// v3: agrega `ambito` (nacional/regional/internacional) al análisis.
// v4: elimina `personas`. Guardar nombres propios junto a la valoración del tono creaba
//     de hecho el vínculo "persona ↔ cobertura negativa" que la política de datos
//     personales prohíbe. Subir la versión hace que las previas se re-enriquezcan solas
//     y pierdan el campo sin necesidad de una migración obligatoria.
export const VERSION_ANALISIS = 4

// --- Eventos (Fase 2) ---

// Umbral de similitud para agrupar noticias en un evento (0..1).
// 0.6*Jaccard(tokens) + 0.4*Jaccard(entidades).
export const UMBRAL_EVENTO = 0.35

// Ventana temporal de agrupación: noticias dentro de N días de la semilla se consideran.
export const VENTANA_EVENTO_DIAS = 14

// Umbral de similaridad para marcar como duplicado (misma historia en otro medio).
export const UMBRAL_DUPLICADO = 0.85

// --- Histórico ---

// Máximo de días a retener en el histórico (rotación). Después se descartan registros.
// OJO: esto rota el ARCHIVO datos/historico.json, no la base. La retención de Postgres
// son los tres parámetros de la sección siguiente. No confundirlos.
export const HISTORICO_MAX_DIAS = 400

// --- Retención en Postgres (purga, ver src/purga.js y dominio/retencion.js) ---
//
// Hasta este rediseño la tabla `noticias` era un sumidero aditivo que crecía sin techo:
// el archivador nunca borra. La purga corre una vez al día (collector/crontab) y aplica
// dos cortes distintos, porque el texto del medio y los metadatos no tienen el mismo
// peso legal.

// Corte 1 — TEXTO. A los N días se vacía el extracto y los campos de `analisis`
// derivados de texto libre. Es contenido del medio: se conserva lo mínimo y por poco
// tiempo.
export const RETENCION_EXTRACTO_DIAS = 180

// Corte 2 — METADATOS. A los N días la fila se borra entera. Medio, titular, fecha,
// autor, URL, categorías y regiones son datos de catálogo, no contenido: se pueden
// retener más tiempo sin acumular exposición.
export const RETENCION_METADATOS_DIAS = 400

// Corte 3 — AUDITORÍA DE CORRIDAS. colecta_ejecuciones suma ~8.760 filas al año (una
// por activación del cron) y tampoco se podaba nunca.
export const RETENCION_EJECUCIONES_DIAS = 400

// Filas por lote de la purga. El pool del collector no fija statement_timeout, pero un
// DELETE masivo mantendría un lock largo justo cuando la portada está leyendo.
export const TAMANO_LOTE_PURGA = 500

// --- Persistencia Postgres (v2) ---

// A diferencia del resto de esta configuración (editada a mano), este flag se deriva
// de la presencia de las credenciales de conexión: son secretos de variable de
// entorno, no algo que el admin "active" aparte. Ver adaptadores/archivador-postgres.js
// y puertos/archivador-de-noticias.js.
export const POSTGRES_ACTIVO = Boolean(process.env.DATABASE_HOST)

// --- Conceptos administrados desde la web (v3) ---

// Leer los conceptos desde la tabla `conceptos` (editable por el rol admin) en vez de
// usar solo config/conceptos.js. Al desactivar, o si la base no responde, el collector
// usa la semilla de config/conceptos.js: nunca se queda sin conceptos.
export const CONCEPTOS_DESDE_BD = POSTGRES_ACTIVO

// Presupuesto de caracteres de la consulta cruda a Google News. fuente-google-news.js
// arma `"a" OR "b" OR ...` y lo codifica en un query string; el límite de facto de las
// URLs (~2 KB tras codificar) se alcanza con ~50 conceptos. Pasarse hace que Google
// responda 4xx y se caiga la red de seguridad de cobertura — el mecanismo que protege
// contra "perder una noticia de un medio grande". Ver dominio/conceptos.js.
export const GOOGLE_NEWS_MAX_LARGO_CONSULTA = 1500
