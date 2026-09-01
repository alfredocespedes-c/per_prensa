# Registro de verificación de medios

Criterio acordado con SECOM (docs/REQUISITOS.md): **"si es alcanzable [con
herramientas gratuitas], entra; si no, no"**. Este registro documenta qué medios se
verificaron, con qué resultado y cuándo — es el respaldo de la cobertura real de la
lista y el insumo para las preguntas abiertas 2, 8 y 12 del documento de requisitos.

## Medios activos (en `collector/src/config/medios.js`)

| Medio | Sección | Feed | Verificado | Notas |
|---|---|---|---|---|
| La Tercera | Prensa Escrita | `https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml` | 2026-07-14 | RSS válido, ~100 ítems, links directos. |
| Diario El Día | Prensa Regional | `https://www.diarioeldia.cl/rss/noticias/` | 2026-07-14 | RSS 2.0, ~200 ítems. Existe índice con +30 canales temáticos en `/rss`. |
| El Ovallino | Prensa Regional | `https://www.elovallino.cl/rss` | 2026-07-14 | RSS válido. Medio de baja frecuencia de publicación (~10 ítems). |
| Radio Bío-Bío | Radio | `https://www.biobiochile.cl/static/feed-rss` | 2026-07-14 | RSS válido y muy activo. **Sirve `Content-Type: application/octet-stream`**: el adaptador no valida content-type a propósito. |
| El Pingüino | Prensa Regional | `https://www.elpinguino.com/feed/` | 2026-07-20 | RSS vivo, 40 ítems, links directos (corrige la ficha anterior que lo daba sin RSS). Del boletín ConectaMedia. |
| Las Noticias de Malleco | Prensa Regional | `https://lasnoticiasdemalleco.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems. Del boletín ConectaMedia. |
| El Observador (Quillota) | Prensa Regional | `https://www.observador.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems; en la corrida de verificación aportó 1 mención. Del boletín ConectaMedia. |
| La Cuarta | Prensa Escrita | `https://www.lacuarta.com/arc/outboundfeeds/rss/?outputType=xml` | 2026-07-20 | RSS Arc (grupo Copesa), 100 ítems. Las variantes /feed y /rss devuelven HTML. |
| Publimetro | Prensa Escrita | `https://www.publimetro.cl/arc/outboundfeeds/rss/?outputType=xml` | 2026-07-20 | RSS Arc, 100 ítems. Las demás variantes cortan la conexión. |
| La Nación | Digital | `https://www.lanacion.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems, links directos. |
| Ex-Ante | Digital | `https://www.ex-ante.cl/feed/` | 2026-07-20 | RSS, 10 ítems. **Solo funciona con barra final**; `/feed` sin barra responde 403. |
| El Periodista | Otros | `https://www.elperiodista.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems. |
| Radio Infinita | Radio | `https://www.infinita.cl/rss.xml` | 2026-07-20 | RSS, 10 ítems (corrige la ficha anterior: la ruta correcta es /rss.xml, no /feed/). |
| Diario El Longino | Prensa Regional | `https://www.diariolongino.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems (Iquique). |
| El Diario de Antofagasta | Prensa Regional | `https://www.diarioantofagasta.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems. |
| Diario Chañarcillo | Prensa Regional | `https://www.chanarcillo.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems (Copiapó). |
| Atacama Noticias | Prensa Regional | `https://www.atacamanoticias.cl/feed/` | 2026-07-20 | RSS WordPress, 10 ítems. |
| Diario El Trabajo | Prensa Regional | `https://www.eltrabajo.cl/?feed=rss2` | 2026-07-20 | Única variante viva (rutas /feed dan 404). San Felipe. |
| G5noticias | Prensa Regional | `https://www.g5noticias.cl/feed/` | 2026-07-20 | RSS, 12 ítems (Valparaíso/Aconcagua). |
| Diario El Heraldo | Prensa Regional | `https://www.diarioelheraldo.cl/feed` | 2026-07-20 | **Sin barra final** (con barra devuelve HTML). 60 ítems (Linares). |
| La Tribuna | Prensa Regional | `https://www.latribuna.cl/rss/global.xml` | 2026-07-20 | RSS propio, 50 ítems (Los Ángeles). |
| Diario Concepción | Prensa Regional | `https://www.diarioconcepcion.cl/rss.xml` | 2026-07-20 | RSS, 10 ítems. |
| Sabes.cl | Prensa Regional | `https://www.sabes.cl/feed/` | 2026-07-20 | RSS, 20 ítems (Biobío). |
| El Insular | Prensa Regional | `https://www.elinsular.cl/feed/` | 2026-07-20 | RSS, 4 ítems (Chiloé, baja frecuencia). |
| El Siglo | Otros | `https://www.elsiglo.cl/feed/` | 2026-07-20 | RSS, 10 ítems. |
| Crónica Digital | Otros | `https://www.cronicadigital.cl/feed/` | 2026-07-20 | RSS, 10 ítems. |
| La Voz de los que Sobran | Otros | `https://lavozdelosquesobran.cl/feed/` | 2026-07-20 | RSS, 10 ítems. |
| País Circular | Digital | `https://www.paiscircular.cl/feed/` | 2026-07-20 | RSS, 10 ítems. Medio ambiental, afín a la pauta CONAF. |
| Diario Sustentable | Digital | `https://www.diariosustentable.com/feed/` | 2026-07-20 | RSS, 15 ítems. Medio ambiental. |
| Radio Futuro | Radio | `https://www.futuro.cl/feed/` | 2026-07-20 | RSS, 10 ítems. |
| Radio Concierto | Radio | sitemap: `https://www.concierto.cl/news-sitemap.xml` | **2026-08-18** | Su robots.txt pasó a prohibir `/feed/` y la corrida lo perdía entero. `/rss` parecía la salida (200, 21 ítems) pero es un **301 al mismo `/feed/`** — el cliente revalida el destino y lo rechaza, correctamente. El news-sitemap es un recurso distinto, permitido y sin redirección: 28 ítems. |
| Radio Nuevo Mundo | Radio | `https://www.radionuevomundo.cl/feed/` | 2026-07-20 | RSS, 10 ítems. |
| Radio Santa María | Radio | `https://radiosantamaria.cl/feed/` | 2026-07-20 | RSS, 10 ítems (Coyhaique). OJO: rsm.cl ya no es de la radio (hoy es una constructora). |
| Radio UdeC | Radio | `https://www.radioudec.cl/feed/` | 2026-07-20 | RSS, 10 ítems (U. de Concepción). |
| Radio JGM | Radio | `https://radiojgm.uchile.cl/feed/` | 2026-07-20 | RSS, 15 ítems (U. de Chile). |
| Meganoticias | Televisión | sitemap: `https://www.meganoticias.cl/sitemaps/sitemap-news.xml` | 2026-07-20 | Piloto de la Fuente 3 (sitemap de noticias). ~140 URLs, retención ~48 h. |
| La Hora | Digital | sitemap: `https://lahora.cl/sitemap/news-sitemap.xml` | 2026-07-20 | Google News sitemap con prefijo `n:`, 250 URLs (43 <48h). Grupo Copesa. |
| Araucanía Diario | Prensa Regional | sitemap: `https://www.araucaniadiario.cl/news_sitemap.xml` | 2026-07-20 | Google News sitemap declarado en robots.txt, 12 URLs. |
| Radio Polar | Radio | sitemap: `https://www.radiopolar.com/sitemap/google-news/sitemap.xml` | 2026-07-20 | Google News sitemap, 68 URLs (Punta Arenas). |
| CNN Chile | Televisión | sitemap: `https://www.cnnchile.com/_files/sitemaps/sitemap_news.xml` | 2026-07-20 | Google News sitemap, 200 URLs, declarado en robots.txt. El RSS devuelve HTML. |
| Radio Pauta | Radio | sitemap: `https://www.pauta.cl/sitemap_news.xml` | 2026-07-20 | Google News sitemap con prefijo de namespace `n:` (el parser lo detecta). 100 URLs. |
| El Líbero | Digital | sitemap: `https://ellibero.cl/news-sitemap.xml` | 2026-07-20 | Google News sitemap, 27 URLs (incluye avisos legales; los filtra la detección de menciones). RSS con redirección rota. |
| El Divisadero | Prensa Regional | sitemap: `https://www.eldivisadero.cl/news-sitemap.php` | 2026-07-20 | Google News sitemap (XML indentado, títulos sin sufijo), 13 URLs. Del boletín ConectaMedia. |
| Puranoticia | Prensa Regional | sitemap: `https://puranoticia.pnt.cl/cms/site/sitemap_news.xml` | 2026-07-20 | Google News sitemap con CDATA, 109 URLs. Del boletín ConectaMedia. |
| Interferencia | Prensa Escrita | `https://interferencia.cl/rss.xml` con `enlaceEnTitulo: true` | **2026-08-18** | Estaba descartado: su CMS emite `<title><a href="/articulos/x">X</a></title>` y el `<link>` es esa etiqueta URL-encodeada pegada al dominio (404 seguro). Se dio de alta con el flag `enlaceEnTitulo`, que rescata la URL del `href` y **descarta el ítem si no la encuentra** (falla cerrado: antes perder la nota que publicar un link roto). 10 ítems; en la corrida de alta aportó 1 mención. |

## Medios del boletín ConectaMedia: candidatos a Fuente 3 (sitemap, fase 2)

Verificados el 2026-07-20: sin RSS utilizable, pero con sitemap de noticias que el
adaptador `fuente-sitemap-news.js` ya soporta (multilínea, sin sufijo de título, CDATA).
Para darlos de alta basta agregarlos a `MEDIOS_SITEMAP` en `config/medios.js` y
verificar una corrida.

| Medio | Sitemap | Nota |
|---|---|---|
| Radio Duna | `https://duna.cl/sitemaps/articles.xml` (vía sitemapindex) | Verificado 2026-07-20: urlset de 45.000 URLs **sin** `news:news`, sin fechas por hora ni títulos — no sirve como fuente de noticias con el adaptador actual. |
| Red soychile.cl | `https://www.soychile.cl/sitemap.xml` | Verificado 2026-07-20: solo 61 landing pages de secciones/ciudades, 0 artículos, 0 `news:news`. No sirve como fuente. |
| Red El Mercurio regional (elsur.cl, mercuriovalpo.cl, estrellaiquique.cl, australtemuco.cl, lidersanantonio.cl) | `https://www.<dominio>/sitemap.xml` | Sitemapindex compartido de ediciones impresas por diario; investigar sub-sitemaps (puede que solo liste portadas del papel). |

## Re-sondeo del 2026-08-18

Se volvieron a probar los descartados y los medios que la corrida real perdía, con el
parser de robots.txt del propio proyecto. Resultados que cambian algo ya anotados arriba
(Radio Concierto, Interferencia). El resto, sin cambio:

| Medio | Estado (2026-08-18) |
|---|---|
| Diario Financiero | El feed histórico da 404 y el sitio no declara ningún feed en su HTML. Sin vía. |
| El Naveghable | Cloudflare con `challenge-platform` (control activo, no un convenio: no se evade). Feeds 404. |
| El Tipógrafo | Toda ruta de feed/sitemap responde 200 con HTML. Sin vía. |
| Sabes.cl | Detrás de Cloudflare; el feed configurado responde HTML (por eso falla con "XML inválido"). Su ficha de activo queda en observación. |
| El Observador | Su robots.txt prohíbe `/feed/` y `/comments/feed/` **explícitamente** (señal dirigida, distinta del `Disallow: /` genérico) y no publica news-sitemap. Se respeta; eximirlo sería una decisión aparte que nadie ha tomado. |
| País Circular | `/feed/` prohibido por robots.txt; su `news-sitemap.xml` es válido pero está **vacío** (0 ítems). Reevaluar. |
| Radio Agricultura | Feeds vivos pero congelados en 2024 (809 días sin publicar por esa vía). |
| Río en Línea | 2 ítems frescos — sigue bajo el mínimo de 3. Reevaluar. |
| La Crónica de Chillán | `?feed=rss2` responde, pero con pubDate 1970 (edición impresa abandonada, como el resto de su red). |
| Ladera Sur, Diario de Valdivia, Digital FM, T13, Emol, 24 Horas, CHV, La Segunda, Radio USACH, Radio Sago, El Martutino | Sin cambio respecto de la ficha del 2026-07-20. |

**Google News**: desde el 2026-08-18 se consulta bajo **exención declarada** de robots.txt
(`ROBOTS_EXENTOS` en `config/parametros.js`, con el fundamento por escrito ahí). Es la
Fuente 2 (red de seguridad): en la corrida de alta aportó 61 notas resueltas al enlace
original del medio. Los medios de esta lista siguen gobernados por robots.txt sin cambios.

## Medios descartados (con evidencia)

| Medio | Estado (2026-07-20) |
|---|---|
| Emol / El Mercurio | WAF corta la conexión en todas las rutas de feed y sitemap-news; el sitemapindex declarado (208 sub-sitemaps anuales) no trae `news:news` ni fechas. |
| 24 Horas (TVN) | WAF corta feeds y sitemap-news; el sitemapindex mensual (.gz) existe pero sin `news:news`. |
| T13 | Todas las variantes de feed y sitemap-news dan 404; `sitemap.xml` (Drupal) trae solo la home. |
| CHV Noticias | CDN catch-all: TODA ruta responde 200 con la portada HTML — imposible descubrir un feed vía HTTP. |
| La Segunda | Catch-all + e-paper; el sitemapindex anual no trae `news:news` ni fechas por URL. |
| Radio USACH | Catch-all total: hasta `robots.txt` devuelve la misma página HTML. |
| ~~Interferencia~~ | **DADO DE ALTA el 2026-08-18** con el manejo especial que esta ficha pedía: ver la tabla de activos (`enlaceEnTitulo`). |
| Radio Agricultura | `/feed/` corta la conexión (WAF); `sitemap.xml` responde 200 con cuerpo vacío. Reintentar más adelante. |
| Digital FM | `/feed/` responde RSS válido pero con **0 ítems** (radio musical sin pauta escrita propia). |
| El Labrador (Melipilla) | `ellabrador.cl` no resuelve DNS — medio aparentemente desaparecido. |
| El Magallanes | `elmagallanes.com`/`.cl` no resuelven; su contenido lo cubre La Prensa Austral (mismo grupo, ya activa). |
| Las Últimas Noticias | ePaper sin artículos web indexables; robots sin sitemap. Fuera por el criterio "si es alcanzable, entra". |
| La Crónica de Chillán | No probado aún; posible vía ladiscusion.cl (mismo grupo). |
| Red "Edición Impresa Soy Chile" (estrellaarica.cl, mercurioantofagasta.cl, mercuriocalama.cl, diarioatacama.cl, cronicachillan.cl) | Los `?feed=rss2` responden XML pero con **pubDate = 01-01-1970** en todos los ítems y lastBuildDate de meses/años atrás: feeds de edición impresa abandonados, sin frescura verificable. Sub-sitemaps por diario responden 200 con cuerpo vacío. |
| Red Mi Voz (elnortero.cl, elobservatodo.cl, elvacanudo.cl, elrepuertero.cl) | Misma plataforma catch-all: todo responde 200 con HTML de portada; sin feed ni sitemap declarado. |
| El Martutino | Sin publicar desde marzo 2026 (lastmod del sitemap); feeds 404. |
| Diario VI Región / La Prensa de Curicó / El Amaule | Feeds 404 y sitemaps inexistentes u obsoletos (2013-2015). |
| Río en Línea | Feed vivo pero con **1 solo ítem** (mínimo 3); reevaluar más adelante. |
| Diario de Valdivia | Catch-all; su sitemap WordPress es fresco pero sin bloques news (candidato si se relaja el criterio). |
| Radio Sago | Timeout total en todas las conexiones (servidor caído o WAF). |
| Ladera Sur | Feeds y news-sitemap responden 200 pero **vacíos** (0 ítems). Reevaluar. |
| Pulso | **Eliminado (2026-08-04):** su entrada en `medios.js` apuntaba exactamente al mismo RSS de La Tercera (misma feedUrl), duplicando la descarga sin aportar cobertura — Pulso es la sección de negocios de La Tercera y sus notas ya entran por ese feed. Si algún día existe un feed propio de Pulso, verificar y re-agregar. |
| Radio Talca | **Eliminado (2026-08-04):** su entrada en `medios.js` apuntaba al feed de **Diario Talca** (`diariotalca.cl/feed`, sin barra final), ya activo como medio propio: mismo contenido dos veces bajo dos medios. Si Radio Talca tiene feed propio (radiotalca.cl u otro dominio), verificar y re-agregar. |

El test `collector/test/config-medios.test.js` prohíbe feedUrls repetidas
(comparadas sin barra final) precisamente para que estos dos casos no se repitan.

## Cómo verificar y agregar un medio

1. Buscar el feed: probar `/rss`, `/feed`, `/feed/`, `?feed=rss2`, `/arc/outboundfeeds/rss/`,
   el HTML de la portada (`<link type="application/rss+xml">`) y el `sitemap.xml`.
2. Confirmar que el feed responde y trae ítems con `<link>` directo al medio:

   ```bash
   # ANTES de nada: comprobar que el robots.txt del medio permite la ruta. Desde el
   # rediseño de exposición legal, el sistema consulta robots.txt antes de cada petición
   # (collector/src/adaptadores/cliente-http.js), así que un medio cuyo robots prohíba su
   # feed simplemente no entrará, y conviene saberlo al darlo de alta y no después.
   curl -s https://<dominio>/robots.txt

   curl -A "COIPO_PRENSA/1.0" <feedUrl>
   ```

3. Agregar la entrada en `collector/src/config/medios.js` (id, nombre, tipo, feedUrl).
4. Ejecutar `npm start` dentro de `collector/` y revisar el JSON generado en `datos/`.
5. Registrar el resultado en este archivo (también los fracasos: evita repetir trabajo).

## Red de seguridad: Google News

Los feeds RSS por medio tienen un límite estructural: un medio de alto volumen (Bío-Bío,
La Tercera) rota sus ~20 ítems más recientes más rápido de lo que corre el cron, así que
una noticia de CONAF puede aparecer y desaparecer del feed en menos de una hora. Eso
choca de frente con el criterio de "no perder noticias de medios grandes".

Por eso se agregó **Google News** como segunda fuente
(`news.google.com/rss/search?q="CONAF" OR "Corporación Nacional Forestal"`), que indexa
las menciones sin depender de la ventana del feed propio de cada medio. Verificado el
15-07-2026: una sola búsqueda trae ~90-100 resultados de decenas de medios (incluidos los
que el feed propio ya rotó).

Detalles de implementación (ver `collector/src/adaptadores/`):

- **Links directos:** los enlaces de Google News van cifrados (`news.google.com/rss/articles/…`).
  Se resuelven a la URL real del medio con el endpoint interno `batchexecute`
  (`resolver-google-news.js`). **Es una técnica no documentada**: Google ya cambió una vez
  el formato (antes la URL iba en base64), y si vuelve a cambiarlo el resolutor devuelve
  null, no se publica ese ítem, y la página se queda con lo último bueno (no se cae).
- **Caché de resolución** en el propio estado (`resolucionesGoogle`) para no re-resolver lo
  ya conocido y no sobrecargar el endpoint.
- **Exclusión de no-prensa:** `conaf.cl` domina la búsqueda con sus propios comunicados y se
  excluye (`DOMINIOS_EXCLUIDOS` en `config/parametros.js`); el admin puede sumar otros.
- **Clasificación:** un medio de la lista curada que llegue por Google cae en SU sección
  (ej. biobiochile.cl → Radio); los demás van a la sección **"Otros medios"**.
- **Extracto:** Google News no entrega el cuerpo, así que el extracto se arma del titular
  (con la mención resaltada si está ahí); si no, se omite para no duplicar el titular.

Se puede desactivar con `GOOGLE_NEWS_ACTIVO = false` en `config/parametros.js` (quedaría
solo la fuente RSS curada).

## Fuente 3: sitemaps de noticias

Para medios **sin RSS** que publican un sitemap de noticias (formato Google News
sitemap, `<urlset xmlns:news>`): se listan en `MEDIOS_SITEMAP` de `config/medios.js`
con `{id, nombre, tipo, sitemapUrl}` y los recolecta
`adaptadores/fuente-sitemap-news.js`. Piloto: Meganoticias (sección Televisión).

Cómo funciona (ver comentarios del adaptador):

- El sitemap trae URL + titular + fecha, **sin cuerpo**. Para detectar la mención en
  el texto (no solo el titular), cada URL nueva se descarga con el extractor de
  contenido, con tope `MAX_DESCARGAS_SITEMAP_POR_CORRIDA` (parametros.js).
- **Caché `sitemapVisto`** (persistida en el estado, hermana de `resolucionesGoogle`):
  URLs ya procesadas por medio, ordenadas para no generar commits espurios. Se poda a
  las URLs presentes en el sitemap actual. Las URLs excluidas por tope NO se marcan y
  se reintentan la próxima corrida (el sitemap retiene ~48 h: nada se pierde).
- Más recientes primero; una página rota se emite con texto vacío (el titular aún
  puede matchear) y se marca vista para no quemar presupuesto cada hora.
- Si el sitemap falla, la corrida sigue (`[FALLO] Sitemap …` en el resumen) y la
  caché previa se conserva sin podar.
- Se desactiva con `SITEMAP_ACTIVO = false` (conserva la caché para el regreso).

Para agregar un medio sitemap: verificar la URL con `curl -A "COIPO_PRENSA/1.0" <sitemapUrl>`
(debe ser un `<urlset>` con bloques `<news:news>`), agregarlo a `MEDIOS_SITEMAP`, correr
`npm start` y revisar la línea `[OK] Sitemap <medio>` y el campo `sitemapVisto` del JSON.
