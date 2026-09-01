# COIPO_PRENSA — Monitor de Prensa CONAF

## Qué es este proyecto

Aplicación web que reemplaza el boletín de prensa diario que CONAF recibía del servicio
pagado **ConectaMedia** (cancelado por falta de presupuesto; el servicio ya no llega).
Muestra las últimas ~100 noticias de medios chilenos con presencia web donde se menciona
**"CONAF"** o **"Corporación Nacional Forestal"**, con el formato del boletín antiguo.

- **Mandante:** SECOM (Gerencia de Comunicaciones de CONAF). Es quien acepta la v1.
- **Responsable/admin:** Luis Monsalve, Unidad de Información y Análisis.
- **Documento de requisitos completo:** [docs/REQUISITOS.md](docs/REQUISITOS.md) — fuente
  de verdad del alcance. Leerlo antes de implementar o cambiar funcionalidades.

## Decisiones de alcance que NO deben violarse

1. **Autoalojada (la arquitectura actual de este repo).** Docker Compose con nginx
   (frontend), API FastAPI, collector con cron interno (supercronic, horario) y
   Postgres. La v1 fue una página estática en GitHub Pages sin backend; ya no existe
   en este repo — no reintroducir esa arquitectura ni documentarla como vigente.
2. **Presupuesto $0**: solo herramientas y servicios gratuitos. Nada de APIs pagadas.
3. **React obligatorio** (scaffold Vite+React ya existe en `frontend/`).
4. **Arquitectura hexagonal** (puertos y adaptadores): la lógica no debe acoplarse a la
   fuente de datos, para poder enchufar una base de datos en la v2 sin reescribir.
5. ~~**Solo lectura**: sin login, sin roles, sin interfaz de administración.~~
   **SUPERADO en la v3**: hay login de **COIPO IAM** (`iam.conaf.cl`, repo
   `COIPO_USUARIOS`) vía OAuth 2.0 Authorization Code con patrón BFF, y **dos roles**:
   `general` (lee el boletín) y `admin` (además edita conceptos y resuelve retiros). NO
   hay tabla de usuarios local: la identidad y los roles viven en el IAM. La **lista de
   medios sigue definiéndose en el código**; los **conceptos ya no**: viven en la tabla
   `conceptos` y se editan desde `/#/configuracion`.
   Ver [docs/AUTENTICACION.md](docs/AUTENTICACION.md).
6. **DOS SUPERFICIES, no una** (rediseño de exposición legal). La app **no** está
   entera detrás del login: la portada (`/#/` y `/#/publica`) y el formulario de retiro
   (`/#/retiro`) son públicos. Lo que cambia entre superficies **no es la presentación
   sino el dato que sale del servidor**:

   | Elemento | Portada pública | Interno (tras COIPO IAM) |
   |---|---|---|
   | Titular, medio, fecha, enlace al original | Sí | Sí |
   | Autor | **No** | Sí |
   | Extracto | **No** | Sí, ≤500 caracteres |
   | Tono, entidades, regiones, eventos | **No** | Sí |

   El recorte ocurre en `backend/app/servicios/mapeo.py` (`CAMPOS_INTERNOS`), **nunca**
   en React: truncar en el cliente no reduce ninguna exposición porque el dato ya viajó.
   El frontend `ProveedorDatos` **recarga al cambiar la fase de sesión**; sin eso, quien
   inicia sesión se queda con la carga útil pública y las vistas internas salen vacías.
   → Respaldado por `backend/tests/test_mapeo.py` (lista blanca pública y aserción
   derivada de `CAMPOS_INTERNOS`) y `test_noticias.py`.
6-bis. **SIN IMÁGENES DE PRENSA, en ninguna de las dos superficies.** Decisión del
   departamento legal (agosto de 2026). No es "dejar de mostrarlas": se cortó la cadena
   entera. El collector ya no extrae el `og:image` (`extraerImagen` no existe), la
   noticia no tiene el campo, la columna `noticias.imagen` se eliminó con un `DROP COLUMN`
   guardado al final de `db/schema.sql`, y la tarjeta es de **solo texto** — tampoco
   queda el monograma con la inicial del medio que la sustituía. La tarjeta no lleva
   ningún elemento visual en su lugar: eso también se decidió.
   → Guardas: `NoticiaItem.test.jsx` pasa una noticia CON `imagen` y afirma cero `<img>`
   en ambas superficies. **No es el único punto de pintado**: `vistas/Historico.jsx` arma
   su propia fila sin delegar en `NoticiaItem`, y tiene guarda propia en
   `Historico.test.jsx`. Una vista nueva que pinte noticias necesita la suya;
   `test_mapeo.py::test_ninguna_superficie_entrega_imagenes`; `contrato-estado.test.js`
   rechaza la clave por lista blanca; `extractor-contenido.test.js` afirma que el módulo
   no exporta nada que extraiga imágenes; `main.integracion.test.js` cubre el trayecto
   completo. Los assets **propios** (banner UIA, favicon, iconos, mapa SVG) no tienen
   relación con esto y se quedan.
7. **El sistema nunca almacena ni muestra más de lo que el medio expone
   deliberadamente**, y el acceso lo gobierna `robots.txt`. Todo lo que sale a la red
   pasa por `collector/src/adaptadores/cliente-http.js`, que consulta la política antes
   de pedir.
   **`robots.txt` es un convenio (RFC 9309), no una norma jurídica**, y así se trata:
   como política del proyecto. `ROBOTS_EXENTOS` (en `config/parametros.js`) exime
   orígenes **por decisión declarada y con su fundamento escrito**; hoy contiene
   `news.google.com`, que declara `Disallow: /` y bloqueaba la red de seguridad de
   cobertura. La exención es **por origen y no se derrama**: los 63 medios chilenos
   siguen gobernados igual. No usar `ROBOTS_ACTIVO = false`, que es el interruptor grueso.
   **Tres cosas distintas, que no deben confundirse**: un convenio (`robots.txt`), un
   control activo (WAF/Cloudflare — saltarlo es evadir, y no se hace), y una prohibición
   dirigida a una ruta concreta (El Observador y País Circular niegan `/feed/`).
   **Trampa verificada**: una ruta permitida que **redirige** a una prohibida sigue
   estando prohibida — `concierto.cl/rss` es un 301 a `/feed/`, y `cliente-http.js`
   revalida el destino. Por eso Radio Concierto entra por su news-sitemap, no por RSS.
   → Respaldado por `collector/test/perimetro-red.test.js`, que falla si alguien llama a
   `fetch` fuera de `fetch-seguro.js`. Es la guarda que faltaba cuando `fuente-rss.js` y
   `fuente-sitemap-news.js` lo llamaban directo y el respeto de robots.txt no ocurría.
8. **El cuerpo del artículo se procesa pero NO se persiste.** Se descarga para detectar
   la mención y analizar, y muere con la corrida: `crearNoticia` no lo guarda. Lo único
   que se almacena del contenido es el extracto centrado en la mención.
   → Respaldado por `collector/test/contrato-estado.test.js`, cuya lista blanca por
   noticia rechaza cualquier clave de más (`texto`, `cuerpo`, `contenido`, `html`…), y
   por `largo-extracto.test.js`, que mide el largo real.

   **Precisión sobre el "≤500":** el texto **del medio** nunca supera `LARGO_EXTRACTO`,
   pero el campo almacenado puede medir hasta 12 caracteres más, porque las marcas de
   recorte `(...)` se añaden después de calcular la ventana. No son palabras del medio;
   el margen está fijado por test para que nadie lo amplíe sin darse cuenta.
9. **Sin exportación masiva.** No hay CSV ni ningún otro formato de descarga.
   → Respaldado por `frontend/src/sin-exportacion.test.js`, que falla ante `text/csv`,
   `new Blob(`, `URL.createObjectURL`, un atributo `download` o un `BotonCSV`.
9-bis. **La mención debe estar en el CUERPO de la nota, no en un enlace a otra.**
    Una nota policial de Radio Polar entró bajo el concepto «Forestin» sin mencionarlo:
    el medio no tiene `<article>`, su único `<main>` envuelve toda la página con un
    listado de titulares de OTRAS notas, y aplanar el HTML **conserva el texto de los
    `<a>`**. Eso es ruido, error inaceptable nº 3 de SECOM.
    `adaptadores/limpieza-html.js` quita, antes de elegir contenedor, los bloques que
    nunca son cuerpo (`nav`/`aside`/`footer`/`form` — **NO** `header` ni `figure`, que sí
    llevan contenido) y los `<a>` que envuelven **bloque** (tarjetas-teaser). Un `<a>`
    **inline** conserva su texto: una mención legítima puede venir enlazada, y borrarla
    sería perder la noticia.
    **Trampa aparte, del mismo caso**: `extraerTexto` tomaba el PRIMER `<article>`, y hay
    medios con 14 anidados donde el primero es una tarjeta de «Lee También» (125 chars).
    Ahora elige el de **más texto** y exige un piso de 400 caracteres antes de creerle.
    **Corregir la extracción NO limpia lo ya ingerido**: la atribución se recalcula sobre
    el extracto PERSISTIDO, así que un falso positivo se reafirma cada hora hasta que la
    ventana lo expulse. Para eso está `scripts/reprocesar-menciones.mjs` (simula por
    defecto, `--aplicar` escribe; re-descarga, recalcula y elimina del JSON **y** de
    Postgres — solo el JSON no basta, el archivador nunca borra; solo Postgres tampoco,
    el upsert horario lo revierte). **Fail-safe: si no se pudo leer la página, se
    conserva.** Borrar por un 404 perdería noticias legítimas.
    → `limpieza-html.test.js`, y las ramas de `extractor-contenido.test.js` que antes no
    tenían ninguna cobertura (`<main>`, texto de `<a>`, `<article>` anidados, piso mínimo).

10. **El boletín se agrupa por concepto y NO tiene bloque "otras".** Los bloques y su
    orden salen de la lista configurada en `/#/configuracion` (`conceptos.orden`), nunca
    de lo que traigan los datos ni de un orden alfabético. Una noticia que el sistema no
    puede atribuir a ningún concepto es un **defecto**, no una categoría: se cuenta y se
    reporta como `[FALLO]` en el resumen de la corrida.
    → `dominio/inclusiones.js` atribuye por titular, extracto **y URL** (el slug repite el
    titular, y es la única señal cuando el extracto viene vacío).
11. **Repositorio pensado para publicarse.** Que no entre contenido de prensa real al
    control de versiones lo vigila `scripts/verificar-sin-contenido-de-prensa.mjs`, que
    corre en CI y bloquea el deploy.

    **Pendiente declarado**: `INSUMO/` está versionado con veinte fichas de prensa reales
    y análisis interno de la UIA. La guarda lo excluye como `DEUDA_CONOCIDA` para no
    dejar el CI rojo, pero sacarlo del repositorio y purgar el historial sigue sin
    hacerse. **Mientras eso no ocurra, el repositorio no debería publicarse.**
12. **Muro de pago blando**: si el medio declara `isAccessibleForFree: false` en su
    JSON-LD, no se extrae el cuerpo; la noticia se publica igual con titular y enlace.
    Fail-open: la ausencia de declaración no es una declaración de que es de pago.
    → `collector/test/muro-de-pago.test.js`. **Aún sin evidencia de campo**: en un
    muestreo de una nota por medio sobre seis candidatos, ninguno declaró el campo.

## Requisitos funcionales clave

- **Jerarquía de dos niveles**: concepto de búsqueda (nivel 1) → tipo de medio (nivel 2).
  Ambos órdenes son enteros persistidos y editables en `/#/configuracion` arrastrando
  (con flechas equivalentes para teclado). **Nunca orden alfabético ni de inserción como
  respaldo silencioso.** El orden de conceptos vive en `conceptos.orden`; el de tipos en
  `secciones.orden` y es **global**, mientras que ocultar un tipo sí es por concepto
  (`concepto_tipo_oculto`). Una noticia aparece **una sola vez**, bajo su concepto de
  mayor prioridad (`noticias.concepto_principal`).
  - **Trampa**: `archivarSecciones` NO debe escribir `orden` en su `ON CONFLICT`, o la
    corrida horaria revertiría lo que el admin acaba de arrastrar.
- Dentro de cada bloque, **lo más reciente arriba**. Cada noticia: medio, titular con
  **link directo** a la nota original, fecha, autor, y —solo en la superficie interna—
  extracto con la mención destacada.
- Ventana móvil de **~100 noticias** (configurable), actualización automática con
  **latencia máxima de 1 hora**; al día a las **8:00 hora de Chile**.
- **Retención**: el texto se purga a los 180 días y la fila entera a los 400
  (`collector/src/purga.js`, cron diario 06:30 UTC, log en `purga_ejecuciones`). La
  retención se aplica **también a la ventana del collector**: si no, el upsert horario
  devolvería a la base el texto que la purga acaba de borrar.
- **Retiro de contenido**: formulario público en `/#/retiro`; lo aplica un admin y surte
  efecto **inmediato** en ambas superficies, porque se filtra en la lectura y no espera
  la corrida horaria. Además el collector descarta lo retirado en la ingesta.
- **Datos personales**: el tono se atribuye a la noticia, nunca a las personas. No se
  extraen ni almacenan nombres de personas (`analisis.personas` ya no existe) y no hay
  ningún ranking de nombres propios. `autor` se conserva solo para atribución. Endpoint
  de derechos del titular en `/api/datos-personales` (solo admin, auditado).
- Errores declarados inaceptables por SECOM (los 4): página caída/en blanco a las 8:00,
  perder una noticia de un medio grande de la lista, mostrar ruido o duplicados, links
  rotos.

## Estructura del repo

- `collector/` — recolector Node ≥22, **arquitectura hexagonal**: `src/dominio/`
  (reglas puras, testeadas con vitest), `src/puertos/` (contratos JSDoc),
  `src/adaptadores/` (RSS por medio + Google News con resolución de links + sitemaps +
  extractor de contenido + JSON + archivador Postgres + repositorio de conceptos
  Postgres), `src/config/` (medios y dominios excluidos se editan AQUÍ; los conceptos
  de config/conceptos.js son semilla y red de seguridad — la base manda, ver decisión
  5), `src/main.js` (composición — único lugar que une todo). El cron vive en
  `collector/crontab` (supercronic dentro del contenedor), no en Actions.
- **Tres fuentes de noticias:** (1) feeds RSS de los medios curados (links directos),
  (2) Google News como red de seguridad de cobertura — **hoy bloqueada por su propio
  `robots.txt`**, ver decisión 7 —, y (3) sitemaps de noticias para medios sin RSS. Se
  excluye conaf.cl (no es prensa). Los medios curados que llegan por Google caen en su
  sección; el resto en "Otros medios".
- **Un solo camino a la red**: `adaptadores/cliente-http.js` (User-Agent, timeout,
  compuerta de `robots.txt`, `Crawl-delay`) sobre `fetch-seguro.js` (anti-SSRF). Ningún
  adaptador debe volver a llamar a `fetch` por su cuenta: sin punto único no hay dónde
  hacer cumplir `robots.txt`. El parser vive en `dominio/robots.js` (RFC 9309: gana la
  regla más larga, empate a favor de `Allow`), y la caché por origen se persiste en el
  estado como `robotsCache`, hermana de `resolucionesGoogle` y `sitemapVisto`.
- `backend/` — API FastAPI sobre Postgres (`/api/noticias`, `/api/historico` paginado,
  `/health`, autenticación BFF, conceptos y su jerarquía, `/api/retiros`,
  `/api/datos-personales`). `db/schema.sql` es la fuente única de verdad del DDL: las
  migraciones van **al final del archivo, en un bloque `DO $$` que consulta
  `information_schema` primero** — el archivo se ejecuta en CADA corrida horaria y un
  `ALTER` desnudo tomaría `ACCESS EXCLUSIVE` sobre `noticias` una vez por hora. Tests en
  `backend/tests/` (pytest; la BD se falsifica con un intérprete parcial de expresiones
  SQLAlchemy en `conftest.py` — una consulta nueva más compleja exige extenderlo).
- `frontend/` — app React (Vite), puramente presentacional: consume la API con
  extractos YA segmentados (`[{texto, resaltado}]`) — no re-implementa detección.
  Lint con oxlint (`.oxlintrc.json`); tests vitest + testing-library junto al código.
  - **Cabecera institucional**: `componentes/BannerInstitucional.jsx`, a proporción
    natural y NO sticky — la sticky es la barra de navegación. **El título del boletín va
    DENTRO del banner** (no hay franja blanca: `Cabecera.jsx` se eliminó), superpuesto
    sobre el campo plano y alimentado por `useDatos()`, así que sale en TODAS las rutas.
    **DOS assets, medidos** (si cambian, volver a medirlos — el nombre no avisa de nada):

    | asset | tamaño | razón | fin de marca+SECOM | campo plano `#064928` |
    |---|---|---|---|---|
    | `banner-secom.jpg` | 3032×177 | 17,1299:1 | x=745 | x 850–2745 |
    | `banner-secom-corto.jpg` | 875×177 | 4,9435:1 | x=745 | termina en él |

    A proporción natural el largo da 80 px de alto a 1366 y 112 a 1920, pero solo 22 en un
    móvil de 390, así que lleva un **piso** vía
    `width: max(100%, --alto-minimo × --razon-banner)` — por debajo de 1165 px de
    viewport la altura se queda en 68 px y el contenedor recorta por la derecha. Nunca
    hay `object-fit`: el filete azul+rojo del borde superior no se puede amputar.
    **El overlay del título no cabe bajo ~560 px** y no es estética: a 390 px solo se ven
    las columnas 0–1015 de 3032 y la marca ocupa hasta 745, o sea ~63 px de campo libre.
    Por eso bajo 560 px un `<picture>` sirve el asset **corto** (que muestra la marca
    COMPLETA, imposible con el largo) y el título baja a su propia franja.
    El overlay nunca puede invadir `--fin-marca` (24,6 %): superponer texto sobre la marca
    es prohibición dura de `implementacion_banner.md` §9.
    Tokens `--color-institucional: #064928` y `--color-acento: #5E8F19`, que **no**
    reemplazan a `--verde: #05833f`.
  - **Tema claro/oscuro**: `componentes/ControlTema.jsx`, en la barra de navegación y
    **visible para anónimos** (antes solo existía en `/#/configuracion`, tras el login).
    Tres estados: sin clave en `localStorage` = sistema; `'claro'`/`'oscuro'` = forzado —
    `'claro'` debe quedar explícito, es el opt-out de la media query. `Configuracion.jsx`
    reusa el MISMO componente, no una copia.
    → El tema oscuro se declara dos veces (`[data-theme='oscuro']` y la media query) y CSS
    no permite compartir el bloque; `src/tema-coherente.test.js` falla si divergen —ya
    había pasado con los 7 tokens de la rampa del mapa— y si aparece un `var(--token)`
    inexistente (había dos vivos, heredando en silencio).
  - **Eventos navegables**: `utilidades/eventos.js` agrupa por `eventId`; la tarjeta
    despliega sus noticias en acordeón y `/#/eventos?evento=<id>` abre el detalle
    completo con enlace compartible. El `eventId` es `evt:<URL canónica>`, así que
    **siempre** se codifica con `createSearchParams`, nunca con template literal.
  - **Mapa coroplético**: `componentes/MapaChile.jsx`, SVG propio en tres bandas
    (Norte/Centro/Sur) — sin Leaflet ni teselas externas. Chile continental mide
    9,3°×38,5°, así que un mapa continuo sale de 118 px de ancho sobre 620 de alto.
    Se usa en `/#/mapa` (grande) y `/#/regiones` (compacto), y clicar una región
    lleva a `/#/regiones?region=<slug>`.
- `frontend/public/geo/regiones-chile.v1.json` — geometría de las 16 regiones
  (~310 KB), **generada** por `scripts/generar-geo-regiones.mjs` a partir de
  `INSUMO_GRAFICO/REGIONES_v1.json` (83 MB, gitignoreado). El nombre lleva versión
  porque nginx lo sirve `immutable`: regenerar implica pasar a `v2`.
- `scripts/` — utilidades de desarrollo, fuera de la arquitectura hexagonal del
  collector: `generar-geo-regiones.mjs` (simplificación del GeoJSON, con
  autoverificación), `servidor-stub.mjs` (sirve la API desde la fixture para poder MIRAR
  las vistas sin Postgres ni IAM; con `--anonimo` reproduce la **superficie pública**) y
  `migracion-privacidad.mjs` (una sola pasada: recorta extractos a 500 conservando la
  mención, purga el texto de más de 180 días, elimina `analisis.personas`, rellena la
  atribución por concepto e informa qué medios necesitan reclasificación manual;
  `--dry-run` por defecto, `--aplicar` para escribir).
- `.github/workflows/ci.yml` — CI + gate de deploy: en cada push/PR corren tests de
  collector (con umbral de coverage), frontend (lint+tests+build), backend (pytest),
  auditoría de dependencias y build de las 3 imágenes Docker; el deploy a producción
  (workflow reusable de infra, fijado a SHA) solo corre en push a `main` con todo en
  verde. `.github/dependabot.yml` mantiene dependencias y pins.
- `docs/REQUISITOS.md` — documento de requisitos (incluye 13 preguntas aún abiertas,
  entre ellas: definición de "duplicado", reglas de detección de menciones
  (mayúsculas/"CONAFE"), lista definitiva de medios, mapeo de secciones, columnas del
  CSV, política ante medios que bloquean el acceso). La nº 11, sobre logos de medios,
  quedó CERRADA en agosto de 2026: no se muestra ninguna imagen de prensa.
- `docs/MEDIOS.md` — registro de verificación de feeds por medio (qué entra y por qué).

## Comandos

- Tests del collector: `cd collector && npm test` (y `npm run test:coverage` con
  umbral). Deben pasar antes de cualquier push: el CI los usa como compuerta del deploy.
- Tests del frontend: `cd frontend && npm test` (vitest + testing-library, jsdom).
- Tests del backend: `cd backend && python -m pytest` (instalar
  `requirements-dev.txt`; no requieren Postgres).
- Corrida real del collector: `node collector/src/main.js --salida
  frontend/public/data/noticias.json` (ese JSON local está gitignoreado).
- Frontend: `cd frontend && npm run dev` (dev), `npm run lint`, `npm run build &&
  npm run preview` (producción local en `http://localhost:4173/`).
- Ver las vistas sin backend: `node scripts/servidor-stub.mjs` y luego
  `cd frontend && VITE_API_PROXY_TARGET=http://localhost:8787 npm run dev`
  (`npm run preview` hereda el mismo proxy). Añadir `--anonimo` al stub para mirar la
  **portada pública** tal como la ve alguien sin sesión.
- Purga de retención: `node collector/src/purga.js` (simula) y `--aplicar` (borra).
- Migración de una pasada: `node scripts/migracion-privacidad.mjs [--aplicar]`.
- Regenerar la geometría del mapa (solo si cambia el insumo):
  `node --max-old-space-size=6144 scripts/generar-geo-regiones.mjs`. El flag hace
  falta: el árbol parseado ronda 1,5-2 GB. El script imprime sus verificaciones y
  falla con código 1 si alguna no pasa.
- Stack completo: `docker compose up -d --build` (requiere `.env`, ver DESPLIEGUE.md).
- Node local: portable en `C:\Users\luis.monsalve\AppData\Local\Programs\nodejs-portable\node-v24.18.0-win-x64`
  (no está en PATH; agregarlo por sesión).

## Criterio de éxito

Puesto lado a lado con un boletín antiguo de ConectaMedia, el resultado debe reconocerse
como "lo mismo, en versión web": mismas secciones, misma información por noticia, estilo
visual similar (verde institucional, extracto con resaltado).
