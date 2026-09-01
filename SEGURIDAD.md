# SEGURIDAD.md — Auditoría de seguridad de COIPO_PRENSA (v3)

> **Etapa 1 de 4 de la cadena.** Evaluación apoyada en OWASP Top 10 (2021), OWASP ASVS y
> clasificación CWE. Solo lectura: no se modificó código, ni ramas, ni configuración, ni la
> base de datos. El único archivo escrito por esta auditoría es este documento.
>
> **Fecha:** 2026-08-14 · **Serie de identificadores:** `CPR-NNN`, inmutables en las 4 etapas.
> **Método:** ciclo adversarial AUDITOR → REFUTADOR → JUEZ. 5 auditores por dominio
> produjeron 25 hallazgos; 10 refutadores independientes (dos lentes por dominio: evidencia +
> alcanzabilidad / control compensatorio + precondiciones + severidad) emitieron 94
> refutaciones. Ninguna severidad propuesta sobrevivió sin recalibrar: **8 hallazgos fueron
> demolidos, 71 refutaciones degradaron la severidad y solo 15 la sostuvieron.**
>
> **La serie SEC-01…SEC-14 de la auditoría anterior (2026-08-02) se conserva íntegra en el
> [Anexo B](#anexo-b--auditoría-2026-08-02-serie-sec-estado-preservado).** Las referencias a
> `SEC-NN` que existen en `REMEDIACION.md`, `DESPLIEGUE.md` y en los comentarios del código
> siguen resolviendo contra ese anexo.

---

## Contexto del sistema

Toda severidad de este informe se justifica **contra este contexto**, no en abstracto. Un
hallazgo evaluado en abstracto se refuta.

| | |
|---|---|
| **Aplicación** | COIPO_PRENSA — monitor de prensa de CONAF. Prefijo `CPR` |
| **Stack** | React 19 + Vite servido por nginx · FastAPI (Python 3.14 en imagen, ver CPR-012) + SQLAlchemy 2.x + psycopg2 · collector Node ≥22 con supercronic · PostgreSQL 17 **compartido**, administrado por otro equipo |
| **Exposición actual y prevista** | **Red interna de CONAF / VPN. NO publicada a Internet.** |
| **Datos** | Recortes de prensa públicos **más PII**: `retiros.ip_origen`, `retiros.contacto`, `retiros.solicitante`, `noticias.autor`, y la tabla `auditoria` (usuario, sub, rol, IP y el nombre de persona buscado en `/api/datos-personales`, en claro) |
| **Autenticación** | SSO OAuth 2.0 Authorization Code contra COIPO IAM (`iam.conaf.cl`, repo `COIPO_USUARIOS`) con patrón BFF. Cookie de sesión **firmada, no cifrada** (itsdangerous). Roles `general` y `admin`. Sin tabla de usuarios local |
| **Despliegue** | GitHub Actions → reusable externo fijado a SHA → **runner self-hosted opaco**. Configuración en un `.env` del servidor, no versionado |
| **Controles compensatorios** | Perímetro de red interna/VPN; reverse proxy externo que termina TLS. **Sin WAF. Sin rate limiting en ninguna capa del repositorio** |

**Modelo de atacante.** Derivado de la exposición, tres actores realistas —y ninguno es un
anónimo de Internet:

- **(a)** alguien ya dentro de la red institucional o en VPN;
- **(b)** un usuario autenticado con rol `general`;
- **(c)** un sitio de prensa remoto cuyo contenido el collector ingiere por diseño.

**Configuración de producción confirmada por el mandante** (el `.env` no está versionado; esto
es declaración, no lectura del repositorio): `SESION_HTTPS_ONLY=true` · `ORIGENES_PERMITIDOS`
definido · `IAM_APP_ID` fijado · `PERMITIR_SIN_ASIGNACION=false` · `SESSION_SECRET` propio de
≥32 caracteres. **Cuatro candidatos a hallazgo murieron por esa confirmación** y están
archivados en la [tabla de descartados](#4-descartados) para que la etapa 2 no los relitigue.

---

## 1. Resumen

**15 VERIFICADOS** (0 Críticos, 0 Altos, 2 Medios, 9 Bajos, 4 Informativos), 2 INDETERMINADOS,
1 EXTERNO, 5 DESCARTADOS.

| ID | Hallazgo | Severidad | Componente | Estado |
|----|----------|-----------|------------|--------|
| CPR-001 | ReDoS en el compilador de patrones de `robots.txt`: un cuerpo de ~30 bytes mata la corrida horaria | **Media** | `collector/src/dominio/robots.js` | VERIFICADO |
| CPR-002 | La sesión no se puede revocar: logout no invalida la cookie firmada y la renovación re-firma el rol sin reconsultar al IAM | **Media** | `backend/app/seguridad.py` + `dependencias.py` | VERIFICADO |
| CPR-003 | El guard anti-SSRF no reconoce IPv4 mapeada en IPv6 hexadecimal (`[::ffff:a00:1]`) | Baja | `collector/src/adaptadores/fetch-seguro.js` | VERIFICADO |
| CPR-004 | `POST /api/retiros` anónimo y sin límite: agotar el cupo cierra el canal público de retiro | Baja | `backend/app/routers/retiros.py` | VERIFICADO |
| CPR-005 | El ejercicio del derecho de supresión **crea** dos registros permanentes del nombre del titular, en tablas sin retención | Baja | `datos_personales.py` + `db/schema.sql` | VERIFICADO |
| CPR-006 | Postgres sin TLS: los 4 pools del collector y el del backend fijan `ssl:false` / `sslmode=disable` | Baja | `collector/src/adaptadores/*-postgres.js` + `backend/app/db/session.py` | VERIFICADO |
| CPR-007 | `fuente-rss.js` bufferiza el feed sin corte de tamaño: la remediación de SEC-06 no cubrió la fuente principal | Baja | `collector/src/adaptadores/fuente-rss.js` | VERIFICADO |
| CPR-008 | `String.fromCodePoint` sin guarda de rango: 11 caracteres bastan para sacar a un medio del boletín en cada corrida | Baja | `fuente-rss.js` + `fuente-sitemap-news.js` | VERIFICADO |
| CPR-009 | El truncado de `X-Forwarded-For` a los **primeros** 200 caracteres descarta la IP que añade nginx | Baja | `backend/app/servicios/auditoria.py` | VERIFICADO |
| CPR-010 | La supresión de datos personales no es determinista ni declara que quedó truncada | Baja | `backend/app/routers/datos_personales.py` | VERIFICADO |
| CPR-011 | `GET /api/noticias` público lee `extracto` y `analisis` de hasta 1000 filas para descartarlos ante un anónimo | Baja | `backend/app/routers/noticias.py` | VERIFICADO |
| CPR-012 | El artefacto desplegado no es el que CI audita; CI corre Python 3.11 y la imagen es 3.14 | Informativa | `.github/workflows/ci.yml` + `backend/Dockerfile` | VERIFICADO |
| CPR-013 | Listas de entrada sin tope y dos `500` no capturados en endpoints de admin | Informativa | `backend/app/schemas.py` + `routers/conceptos.py` | VERIFICADO |
| CPR-014 | Crear, actualizar y eliminar conceptos se auditan **sin IP**; reordenar sí la registra | Informativa | `backend/app/routers/conceptos.py` | VERIFICADO |
| CPR-015 | `.gitignore`/`.dockerignore` excluyen secretos por nombre exacto, no por patrón | Informativa | `.gitignore` + `.dockerignore` | VERIFICADO |
| CPR-016 | Deploy a producción sin compuerta humana (`environment:`) | — | `.github/workflows/ci.yml` | **INDETERMINADO** |
| CPR-017 | El cerrojo `PERMITIR_SIN_ASIGNACION` es una lista negra de un literal (`'general'`) | — | `backend/app/routers/auth.py` | **INDETERMINADO** |
| CPR-018 | El flujo Authorization Code no usa PKCE | Informativa | `backend/app/routers/auth.py` → IAM | **EXTERNO** |
| CPR-019…023 | Ver [tabla de descartados](#4-descartados) | — | — | DESCARTADO |

### Categorías del alcance verificadas limpias

Cada una fue revisada y ninguna produjo hallazgo. Se documenta el mecanismo que lo impide para
que la próxima auditoría no repita el trabajo:

- **Inyección SQL — limpia.** Los 4 sitios de SQL en texto crudo del backend usan `text()` con
  parámetros ligados o son estáticos (`conceptos.py:371-381` y `:385-396`, `auditoria.py:18-24`,
  `salud.py:32`). La única interpolación en SQL de todo el repositorio es
  `pg_advisory_lock({CANDADO_ESQUEMA})` (`bootstrap.py:39`, `esquema-postgres.js:29`), con una
  constante entera del módulo. **Ningún `ORDER BY`, `LIMIT` ni nombre de columna proviene del
  cliente**: todos son literales del código.
- **Inyección de comandos — limpia.** Un solo uso de `child_process` en el repositorio:
  `execFileSync('git', ['ls-files'])` (`scripts/verificar-sin-contenido-de-prensa.mjs:75`), con
  argumentos en array, sin shell y sin entrada externa.
- **XSS por sink de HTML — limpia.** Cero coincidencias de `dangerouslySetInnerHTML`,
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval(`, `new Function` y `document.write` en
  todo `frontend/src`. El extracto se pinta como texto en nodos React
  (`NoticiaItem.jsx:253-259`).
- **XSS por atributo — cerrada en origen.** `canonicalizarUrl` (`dominio/noticia.js:19`) admite
  solo `http:`/`https:` y `crearNoticia` descarta la noticia entera si falla (`:46`); React 19
  bloquea `javascript:` en `href` como segunda barrera. Es SEC-04, cerrado y vigente.
- **CORS — postura correcta.** El backend no monta ningún middleware (`grep add_middleware` sobre
  `backend/app` → sin coincidencias); todo es mismo-origen vía nginx (`nginx.conf:8-16`).
- **Carga de archivos — sin superficie.** No hay `Form`, `File`, `UploadFile` ni `request.json()`
  en ningún endpoint; toda entrada pasa por un modelo Pydantic.
- **Exportación masiva — sin superficie.** Verificada por el test
  `frontend/src/sin-exportacion.test.js`.
- **Secretos en el historial de git — limpio.** `git log --all --diff-filter=A` filtrado por
  `.env|*.pem|*.key|id_rsa|credentials*|*.p12|secrets*` devuelve **únicamente `.env.example`**;
  el pickaxe de `client_secret` solo encuentra nombres de variable vacíos y el de `PRIVATE KEY`
  no encuentra nada. `git ls-files | grep -i env` devuelve solo `.env.example`. **No hay ninguna
  credencial real commiteada.** El único dato residual es la IP interna del anexo SEC-09.
- **Separación de superficies pública/interna — sostenida.** Ningún camino entrega campos
  internos a un anónimo: `mapeo.py` es la frontera única, `NoticiaPublicaOut` lleva
  `extra="forbid"` (`schemas.py:32`) y `incluirExcluidas` se ignora sin sesión admin
  (`noticias.py:76`). CPR-011 documenta un coste de rendimiento de ese diseño, **no** una fuga.
- **Fijación de sesión — no aplica.** La cookie se emite solo tras el callback con un payload
  nuevo (`seguridad.py:92-109`); no hay identificador de sesión aceptado desde el cliente.
- **IDOR — no aplica por modelo de datos.** Ninguna tabla tiene columna de propietario
  (`db/models.py:25-138`): el modelo es "admin global vs lector global", consistente en los 21
  endpoints. La comprobación de existencia (404) está presente en los cinco endpoints con `id`.

### Riesgo cerrado por eliminación: fuga de lectura a servidores de medios (imágenes)

**No estaba catalogado en ninguna auditoría, y debería haberlo estado.** Se consigna acá porque
la superficie desapareció y conviene que quede el rastro de que existió.

La tarjeta de noticia enlazaba (`hotlink`) la imagen del `og:image` al servidor del medio. Cada
vez que alguien abría la portada, el navegador hacía **una petición por noticia a un tercero**,
entregándole la IP del lector, su `User-Agent` y —por la URL de la imagen— qué nota concreta
estaba mirando. Con ~200 imágenes en una ventana de 271 noticias, eso repartía el patrón de
lectura de SECOM entre decenas de medios distintos, en una portada **pública y sin sesión**.

La única mitigación era `referrerPolicy="no-referrer"`, que oculta *desde dónde* se pide pero no
*quién* pide ni *qué*. Insuficiente por construcción: la IP y la URL de la imagen viajan igual.

**Estado: cerrado, sin remediación pendiente.** Se eliminó el dato, no el pintado: el collector
ya no extrae la imagen, la columna `noticias.imagen` se eliminó con un `DROP COLUMN` guardado en
`db/schema.sql` y `NoticiaItem` no tiene ningún `<img>`. **Cero peticiones a terceros desde el
navegador del lector.** Lo sostiene `NoticiaItem.test.jsx`, que pasa una noticia con `imagen`
poblada y afirma que el DOM no contiene ningún `img[src]` absoluto en ninguna de las dos
superficies. El motivo de la decisión fue de propiedad intelectual (departamento legal); el
cierre de este riesgo es un efecto colateral, pero real.

*Nota:* SEC-12 (ausencia de `Content-Security-Policy`) sigue abierto. Una directiva
`img-src 'self' data:` en `frontend/nginx.conf` haría que el navegador se negara a cargar una
imagen de terceros aunque alguien reintrodujera el código. No se incluyó: tocar cabeceras de
nginx es despliegue y merece su propia decisión.

---

## 2. Hallazgos verificados

### [CPR-001] ReDoS en el compilador de patrones de `robots.txt`

**Severidad final: Media.** El auditor propuso Alta; la degradación se sostiene en un control
compensatorio con evidencia (ver *Condición del veredicto*).
**Categoría:** CWE-1333 (Inefficient Regular Expression Complexity) · OWASP A05:2021
**Componente:** `collector/src/dominio/robots.js`, consumido por `adaptadores/politica-robots.js`

**Evidencia.** `collector/src/dominio/robots.js:17-19` y `:22-30` — verificado directamente:

```js
function escaparRegex(texto) {
  return texto.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}
```

La clase de caracteres **no incluye `*`**, y el compilador lo traduce a `.*`
(`robots.js:25`: `if (caracter === '*') fuente += '.*'`). La regla se prueba de forma **síncrona**
contra el path de cada URL en `robots.js:140-141`, invocada desde `politica-robots.js:104-105` y
desde el único punto de salida a la red, `cliente-http.js:83-85`.

**Medición.** Reproducida de forma independiente por **tres agentes**, ejecutando las funciones
puras del propio repositorio, sin red y sin escribir archivos:
`permiteRuta(parsearRobots('User-agent: *\nDisallow: /' + 'a*'.repeat(k) + 'b'), 'COIPO_PRENSA/1.0', '/' + 'a'.repeat(n))`

| k (asteriscos) | n=40 | n=60 |
|---|---|---|
| 6 | 41–45 ms | 123 ms |
| 7 | 214–241 ms | 1 156 ms |
| 8 | 1 152 ms | 7 658 ms |
| 9 | — | **179 134 ms (≈3 min)** |

El crecimiento medido es de ×5 a ×9 por cada `*` adicional. Con 12 asteriscos —un cuerpo de unos
30 bytes— se superan las horas.

**Cadena de explotación.**
1. Un medio de la lista curada (`config/medios.js`) es comprometido, o lo es su CDN o su DNS. No
   se requiere ningún acceso a CONAF: es el actor **(c)** declarado.
2. Sirve en `/robots.txt` el cuerpo `User-agent: *\nDisallow: /a*a*a*a*a*a*a*a*a*a*a*a*b`.
   `politica-robots.js:73` lo acepta (pesa muchísimo menos que `MAX_BYTES_ROBOTS = 512_000`) y
   `parsearRobots` lo compila.
3. El mismo sitio publica en su feed un ítem cuyo titular contiene "CONAF" —para pasar el filtro
   de `main.js:275`— y cuyo `<link>` tiene un path de 60 caracteres `a` sin `b`.
4. El enriquecimiento (`main.js:429-436`) llama al extractor, que pasa por
   `cliente-http.js:83` → `politica.puedePedir(url)` → `permiteRuta` → `regla.regex.test(path)`.
5. El motor prueba todas las particiones del path entre los doce `.*` antes de fallar:
   backtracking catastrófico. **El `AbortSignal.timeout` de `cliente-http.js:91` solo aborta el
   `fetch`, no la regex**: el bucle de eventos queda bloqueado y ni `Promise.allSettled` ni
   `mapaConLimite` avanzan.
6. La corrida muere sin llegar a `main.js:583` (`await repositorio.guardar(estado)`) ni al
   sumidero Postgres: no se escribe `noticias.json` y no se archiva nada.
7. Como el estado no se persiste, `robotsCache` tampoco: la corrida siguiente vuelve a descargar
   el mismo `robots.txt` y **reincide en cada corrida horaria** mientras el medio lo sirva.

**Precondiciones.**
- Un origen del que el collector pida algo sirve un `robots.txt` bajo control del atacante.
- `ROBOTS_ACTIVO = true` (`config/parametros.js:38`, valor versionado en el repositorio).
- El mismo origen entrega una URL con path largo que el collector vaya a pedir.
- Respuesta 2xx en `/robots.txt`; un 5xx haría fail-closed y no habría parseo peligroso.
- **No se requiere**: acceso a la red de CONAF, sesión, ni ausencia de WAF (el tráfico es
  saliente).

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Acotar el patrón antes de compilarlo en `patronARegex`: rechazar patrones con más de N comodines (N=4) o más de 256 caracteres, y limitar el número de reglas por grupo | Bajo — una guarda en una función pura ya cubierta por tests | Alta para el vector medido: sin comodines encadenados el backtracking no explota | Bajo. Solo cambia el veredicto para `robots.txt` patológicos; en el peor caso una regla exótica deja de aplicarse (fail-open acotado) |
| 2 | Reemplazar `patronARegex` por un matcher de prefijo con comodines sin `RegExp` (glob de dos punteros con memo, O(n·m) garantizado), conservando la semántica RFC 9309 de `*` y `$` | Medio — 30-50 líneas y ampliar la batería de `permiteRuta` | **Total** para esta clase: elimina el motor de backtracking del camino de decisión | Medio. `permiteRuta` gobierna si se pide o no a cada medio; un error de semántica se traduce en dejar de recolectar un medio |
| 3 | Aislar todo el parseo de contenido remoto (robots, HTML, XML) en un `worker_thread` con timeout duro por operación, y fijar `mem_limit`/`cpus` al contenedor collector | Alto — reestructura el pipeline; es la opción 3 que SEC-01 dejó pendiente | Total y defensiva ante cualquier ReDoS presente o futuro | Medio-alto. Cambia el modelo de ejecución de `main.js` y la propagación de errores; exige revalidar las tres fuentes end-to-end |

**Recomendada: 1, y después 2.** La 1 cierra el vector medido hoy con riesgo casi nulo; la 2 es
la corrección de raíz.

**Condición del veredicto.** VERIFICADO por evidencia literal confirmada, cadena completa y
medición reproducida tres veces. **La severidad baja de Alta a Media por un control
compensatorio con evidencia**: `collector/crontab:5-9` documenta el backstop
`timeout -s KILL 55m` con el texto *"SIGKILL porque un cuelgue síncrono (regex, etc.) ignora
SIGTERM"*, introducido el 2026-08-11 —**posterior** a SEC-01— precisamente para esta familia. El
cuelgue está acotado a ≤55 min, dos corridas nunca se solapan y la cadencia horaria se
restablece sola. SEC-01 se calificó Alta porque el recolector quedaba "congelado
indefinidamente"; hoy no lo queda. **No es relitigación de SEC-01**: es el mismo defecto en un
archivo distinto (`dominio/robots.js`) que la remediación de SEC-01 no tocó.

---

### [CPR-002] La sesión no se puede revocar

**Severidad final: Media.** El auditor propuso Alta; las cuatro refutaciones coincidieron en
Media con el mismo argumento.
**Categoría:** CWE-613 (Insufficient Session Expiration) · OWASP A07:2021
**Componente:** `backend/app/seguridad.py` + `dependencias.py` + `routers/auth.py`

**Evidencia.**
- `backend/app/seguridad.py:112-117` — *"Solo HMAC + reloj. NO consulta al IAM ni a Postgres."*
- `backend/app/dependencias.py:68-71` — la renovación re-emite la cookie con el payload existente.
- `backend/app/seguridad.py:143` — `datos = {**datos, "renovada_en": int(time.time())}`: se
  re-firma **el rol** sin verificación alguna.
- `backend/app/routers/auth.py:193-195` — logout emite un `Set-Cookie` de borrado y nada más.
- `backend/app/seguridad.py:37-38` — el único corte es global: `VERSION_SESION`.
- `git grep -n -i -E "revoc|jti|sesiones_cerradas" -- backend/` → **cero coincidencias**
  (verificado por un refutador).

**Cadena de explotación.** Actor: un funcionario que hoy tiene rol `admin` y mañana es degradado
o desvinculado.
1. Con su sesión vigente, la cookie contiene `{"rol": "admin", "expira_en": ahora + 2592000…2851200}`
   (`seguridad.py:94-98` con los defaults de `config.py:140,144`: 30 días + jitter de hasta 3).
2. El administrador del IAM le quita el rol o deshabilita la cuenta. **Ningún endpoint vuelve a
   preguntar al IAM**: el único punto que habla con él es el callback.
3. Cada vez que usa la app, `debe_renovarse` es cierto (≥3600 s) y el rol `admin` se re-firma,
   reiniciando la ventana de inactividad de 7 días.
4. Conserva `admin` —escritura de conceptos, `GET`/`PATCH` de retiros con PII, y
   `/api/datos-personales`— durante **7 días** si abandona la app, y hasta **30-33 días** si la
   toca una vez por semana.
5. Pulsar "Cerrar sesión" no cierra nada: el payload firmado sigue validando en cualquier otro
   cliente que tenga copia de la cookie.

**Precondiciones.**
- El actor tuvo una sesión legítima creada antes de la revocación.
- Acceso de red (interna o VPN).
- Tocar la aplicación al menos una vez cada 7 días para llegar al tope absoluto.
- No se ha subido `VERSION_SESION` ni rotado `SESSION_SECRET` en ese intervalo.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Reducir las ventanas por `.env`: `SESION_INACTIVIDAD_SEGUNDOS=86400` y `SESION_ABSOLUTA_SEGUNDOS=604800` | Muy bajo — dos variables y un reinicio, sin tocar código | Parcial: acorta de 33 días a ≤7, pero no añade revocación y logout sigue sin invalidar | **Medio y explícito**: ataca el requisito de las 8:00 (`docs/AUTENTICACION.md:50-60`). Con 1 día de inactividad, una caída del IAM a las 07:50 deja a SECOM fuera |
| 2 | Añadir un `jti` al payload y una lista de `jti`/`sub` revocados en Postgres, consultada con caché en memoria y **fallo abierto** si la base no responde. Logout inserta el `jti`; un endpoint de admin revoca por `sub` | Medio — una tabla, ~40 líneas, y tests | **Alta**: cierra logout y permite revocar por usuario sin expulsar a nadie más | Bajo-medio: introduce dependencia de Postgres en el camino caliente, mitigada por el fallo abierto y la caché |
| 3 | Revalidación perezosa contra el IAM al renovar: refrescar rol y vigencia; si el IAM no responde, mantener la sesión y reintentar | Alto — exige un endpoint del IAM que no consta en este repo | Muy alta: cierra también la degradación `admin → general`, con desfase máximo de 3600 s | Alto: rompe la invariante de que fuera del callback ninguna petición depende del IAM, sustento del requisito de las 8:00 |

**Recomendada: 2.** Es la única que cierra el logout sin tocar el requisito de disponibilidad.

**Condición del veredicto.** VERIFICADO: las siete citas fueron confirmadas una a una por dos
refutadores, la alcanzabilidad está probada y **ninguna refutación presentó un control
compensatorio que cierre la ventana**. La severidad baja de Alta a Media por tres hechos
citados: (i) el tope absoluto **no** es acumulable —`poner_cookie_sesion` solo reescribe
`renovada_en` y `verificar_sesion` corta por `expira_en` (`seguridad.py:131`)—; (ii) no hay
ningún paso controlado por un atacante: la cadena depende de un evento administrativo externo;
(iii) existe control detectivo completo —toda acción admin queda auditada con `sub`, rol e IP— y
control correctivo disponible el mismo día: `docs/AUTENTICACION.md:69` **no prohíbe rotar**,
restringe una ventana de dos horas (07:00-09:00).

---

### [CPR-003] El guard anti-SSRF no reconoce IPv4 mapeada en IPv6 hexadecimal

**Severidad final: Baja.** **Categoría:** CWE-918 (SSRF) + CWE-1289 · OWASP A10:2021
**Componente:** `collector/src/adaptadores/fetch-seguro.js` (`esIpPrivada` / `hostPermitido`)

**Evidencia.** `fetch-seguro.js:21-36`: la rama IPv4 (`:23`) exige cuatro grupos decimales
separados por puntos, y la última comprobación `/^(fe80|fc|fd)/` no puede casar una cadena que
empieza por `:`. **Bypass reproducido por tres agentes** importando `esIpPrivada` del propio
repositorio, sin red: `http://[::ffff:169.254.169.254]/x` se normaliza a hostname
`[::ffff:a9fe:a9fe]` y `esIpPrivada` devuelve `false`; ídem `::ffff:a00:1` (= 10.0.0.1) y
`0:0:0:0:0:ffff:7f00:1`. Los controles equivalentes **sí** funcionan (`127.0.0.1` y el decimal
`2130706433` devuelven `true`): el hueco es específico de la notación hexadecimal v4-mapeada.
`dns.lookup('::ffff:a00:1',{all:true})` devuelve la misma dirección, así que la segunda
evaluación de `hostPermitido` falla igual y **autoriza**.

**Cadena de explotación.** Actor **(c)**: un medio curado comprometido publica en su feed o
sitemap un `<link>`/`<loc>` con literal IPv6 y un titular que menciona "CONAF"; el collector
normaliza la URL, el guard autoriza, y `fetch-seguro.js:68` emite la petición, que en un stack
dual el kernel enruta por IPv4 mapeada hacia la red interna. Por la ruta del sitemap
(`fuente-sitemap-news.js:76-82`), si la respuesta interna declara `content-type` html y contiene
un concepto vigilado, su cuerpo puede terminar como extracto persistido.

**Precondiciones.**
- Medio curado comprometido (Google News **no** sirve de vector: `ROBOTS_ACTIVO` lo bloquea).
- **No verificable desde el repositorio:** que el contenedor tenga stack IPv6 utilizable.
  `docker-compose.yml:43-55` define el servicio `collector` sin `networks:` ni `sysctls:`.
- Que el servicio interno responda 4xx en `/robots.txt` o que su origen ya esté cacheado como
  permitido; un timeout hace **fail-closed** (`politica-robots.js:75-78`).

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Normalizar la forma hexadecimal v4-mapeada en `esIpPrivada` antes de decidir, y cubrir de paso `192.0.0.0/24`, `198.18.0.0/15`, `224.0.0.0/4` y `240.0.0.0/4` | Bajo — función pura, testeable sin red | Total para el vector medido | Muy bajo: ningún medio legítimo usa literales IPv6 |
| 2 | Rechazar toda URL cuyo hostname sea un literal IP (v4 o v6): los medios siempre usan nombre de dominio | Bajo-medio — una guarda, tras confirmar que ningún medio de `config/medios.js` usa IP literal | Total para literales de cualquier notación presente o futura | Bajo, condicionado a esa comprobación |
| 3 | Fijar la resolución: resolver una vez, filtrar y conectar contra la IP validada pasando el nombre por Host/SNI | Alto — toca el transporte de las 6 rutas de salida | Total: elimina la ventana entre validar y conectar (**cierra además CPR-021**) | Medio-alto: cambia cómo se conecta a los 63 medios (CDN multi-IP, HTTP/2, SNI) |

**Recomendada: 1 + 2.** La 3 solo si se decide cerrar también el residual de DNS-rebinding.

**Condición del veredicto.** VERIFICADO: el bypass del control es un hecho medido tres veces.
Severidad Baja —y no Media— porque el impacto depende de un eslabón no verificable (stack IPv6
en el contenedor), el fail-closed de robots deja fuera de alcance los servicios internos no-HTTP
(Postgres, SSH, redis), y no hay canal de retorno directo para el atacante.

---

### [CPR-004] `POST /api/retiros` anónimo y sin límite: agotar el cupo cierra el canal de retiro

**Severidad final: Baja.** *Consolida los identificadores `retiros-cupo-agotable-por-anonimo` y
`retiros-bandeja-llena-cierra-canal-legal`, emitidos por dos auditores distintos sobre la misma
causa raíz.*
**Categoría:** CWE-770 + CWE-799 · OWASP A04:2021
**Componente:** `backend/app/routers/retiros.py` + `frontend/nginx.conf` (sin `limit_req`)

**Evidencia.** `retiros.py:58-59` — la firma es `def crear(cuerpo, request, db)`: **ninguna
dependencia de autorización**; `main.py:63` lo monta sin guard genérico. `retiros.py:36` —
`MAX_PENDIENTES = 500`. `retiros.py:60-68` — el único control es un `count()` global y un 503.
`grep -rn "limit_req|limit_conn" frontend/nginx.conf docker-compose.yml` → **sin coincidencias**.

**Cadena de explotación.**
1. Un actor con alcance de red (sin credenciales) emite 500 POST válidos; el cuerpo mínimo es
   `{"ambito":"noticia","clave":"x"}`.
2. Cada petición cuesta **dos transacciones** contra el Postgres compartido: `INSERT` en
   `retiros` (`:80-81`) e `INSERT` en `auditoria` (`:83-87`), y almacena hasta ~3,1 KB.
3. A partir de la petición 501, **todo** envío del formulario recibe 503.
4. La recuperación es asimétrica: solo un admin puede vaciar la bandeja y **solo de a una fila**
   (`PATCH /{retiro_id}`, `:102`); `PanelRetiros.jsx` emite un PATCH por solicitud. No existe
   operación masiva, ni caducidad de pendientes, ni la purga toca la tabla (`purga.js:56-58`).

**Precondiciones.** Alcance de red interna/VPN, sin credenciales. Ausencia de rate limiting
(condición declarada del sistema). Que la bandeja no se vacíe sola: verificado.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Cupo por origen además del global: contar pendientes con el mismo `ip_origen` en 24 h (la columna ya se persiste, `:78`) y rechazar con 429 pasadas N | Bajo — una consulta y ~10 líneas | Impide que un solo origen cierre el canal para todos | Bajo-medio: depende de que `ip_origen` sea discriminante — ver CPR-009, que hoy lo compromete |
| 2 | Rechazo masivo para el admin (PATCH sobre lista de ids, o marcar como rechazadas las anteriores a una fecha) y paginar `GET /api/retiros` | Medio — endpoint, paginación, panel y tests | No impide el llenado, pero convierte 500 acciones manuales en una | Medio: un rechazo mal filtrado podría descartar una solicitud legítima; el PATCH ya permite revertir |
| 3 | Rate limiting por IP sobre `POST /api/retiros` en el reverse proxy externo, coordinado con DevOps | Alto — fuera de este repositorio | Único control que ataca el problema en el perímetro y cubre además `/api/noticias` | Alto: el proxy externo es opaco desde aquí; un límite mal calibrado puede cortar tráfico legítimo |

**Recomendada: 1 + 2.**

**Condición del veredicto.** VERIFICADO. Es **el único hallazgo del lote cuyo actor no es un
admin ni depende de un evento externo**: cuatro refutaciones lo atacaron por control
compensatorio y alcanzabilidad y ninguna encontró con qué; se buscó deduplicación, caducidad,
operación masiva, rate limiting y captcha, y no existe ninguno. Severidad Baja —no Media— porque
el propio 503 entrega el canal alternativo (`retiros.py:66`, *"Escriba a uia@conaf.cl"*), que
además está publicado de forma permanente en el pie de todas las rutas
(`PieInstitucional.jsx:29-33`); el derecho se degrada de canal, no se pierde. Se registra el
matiz aportado por una refutación: al no estar la app publicada a Internet, un medio externo no
alcanza el formulario de todos modos.

---

### [CPR-005] El ejercicio del derecho de supresión crea dos registros permanentes del nombre

**Severidad final: Baja.** **Categoría:** CWE-359 · OWASP A01:2021
**Componente:** `backend/app/routers/datos_personales.py` + `db/schema.sql` + `collector/src/purga.js`

**Evidencia.** `datos_personales.py:110` — `detalle={"nombre": limpio, ...}`: el nombre buscado se
persiste **en claro** en `auditoria.detalle`. `datos_personales.py:150` — el mismo nombre entra en
`retiros.motivo`, tabla que un admin lee íntegra por `GET /api/retiros` sin paginación
(`retiros.py:98`). `purga.js:56-58` — las tres únicas llamadas de la purga son
`purgarExtractos`, `purgarNoticias` y `purgarEjecuciones`. Verificado de forma independiente por
dos refutadores: `grep -rn "DELETE FROM"` sobre todo el repositorio devuelve **cinco líneas**, y
ninguna toca `auditoria` ni `retiros`.

**Cadena.** Cuando una persona ejerce su derecho de supresión, el sistema borra las noticias pero
**crea** dos registros permanentes de su nombre: uno en `auditoria` (invisible desde la
aplicación —no existe ningún `SELECT` sobre esa tabla en todo el backend— y sin caducidad) y otro
en `retiros.motivo`, visible a cualquier admin. El dato que se pidió borrar sobrevive
indefinidamente en la base compartida. A ello se suma que `retiros.ip_origen` acumula la cadena
XFF de cada envío del formulario público, también sin caducidad.

**Precondiciones.** Que el endpoint y el formulario se usen, que es su propósito declarado. **El
hallazgo no depende de que la purga falle, sino de que haga exactamente lo que dice hacer.**

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Dejar de escribir el nombre en claro: sustituirlo por `sha256(...)[:16]` más la longitud en `datos_personales.py:110`, y un `motivo` sin el nombre en `:150`. La trazabilidad de "se hizo una supresión, por quién y cuándo" se conserva intacta | Bajo — dos líneas | Elimina el peor dato acumulado. No resuelve la acumulación de IPs ni contactos | Bajo: ningún código del repositorio lee `auditoria.detalle` ni `retiros.motivo` para decidir nada |
| 2 | Añadir `purgarAuditoria(corte)` con su propio `RETENCION_AUDITORIA_DIAS`, siguiendo el patrón `porLotes` ya existente y registrando contadores en `purga_ejecuciones` | Medio — ~60 líneas, un parámetro y una migración aditiva | Cierra la acumulación en `auditoria` para todos los campos | Medio, **y contiene una decisión que debe elevarse**: cuánto tiempo se conserva la traza es política, no ingeniería |
| 3 | Separar traza de PII: mover el detalle sensible a un canal de log institucional con retención propia, dejando en la tabla solo evento, `sub`, objeto y timestamp; y añadir un endpoint de solo lectura de `auditoria` | Alto — destino de log externo y coordinación con el equipo de BD | Resuelve retención, exposición en la base compartida y el hecho de que hoy nadie pueda leer la traza desde la app | Alto: introduce una dependencia externa en un camino que hoy es best-effort y no puede bloquear (`auditoria.py:67-71`) |

**Recomendada: 1.** Es barata, no toca la traza y ataca el dato que no debería estar ahí.

**Condición del veredicto.** VERIFICADO en su núcleo. **Dos partes del hallazgo original se
caen y se registran para que no se relitiguen:** (i) la "contradicción con la política declarada
de 180/400 días" es falsa — `CLAUDE.md:113` está en la sección del boletín y su sujeto es
`noticias`; no existe política de retención declarada para la traza, y `db/schema.sql:136-139`
declara el propósito **opuesto** para `auditoria`; (ii) **purgar `retiros` es funcionalmente
imposible**: el filtro de lectura consulta la tabla viva en cada carga
(`servicios/retiros.py:31`) y el collector la consulta en cada corrida
(`repositorio-retiros-postgres.js:16-20`), de modo que borrar una fila **resucitaría** la noticia
retirada. Lo que sobrevive es exactamente el nombre en claro y la falta de caducidad de
`auditoria`.

---

### [CPR-006] Postgres sin TLS en las cinco conexiones

**Severidad final: Baja.** **Categoría:** CWE-319 (Cleartext Transmission) · OWASP A02:2021
**Componente:** los 4 pools del collector + `backend/app/db/session.py`

**Evidencia.** `ssl: false` verificado con grep en `archivador-postgres.js:156`,
`purgador-postgres.js:46`, `repositorio-conceptos-postgres.js:52` y
`repositorio-retiros-postgres.js:31`; y `sslmode: "disable"` en `backend/app/db/session.py:17-18`.
En node-postgres, `ssl: false` no significa "sin verificar el certificado": significa que **el
cliente no negocia TLS en absoluto**. `COLUMNAS_NOTICIA` (`archivador-postgres.js:14-20`) incluye
`autor`, PII declarada en el contexto.

**Cadena.** Actor **(a)**: alguien con capacidad de observar tráfico entre el host de la
aplicación y el servidor Postgres compartido. Cada hora cruzan la red en claro el handshake de
autenticación y el `INSERT` de hasta 1000 noticias con sus 25 columnas; a diario, la purga. Aun
con SCRAM el observador no recupera la contraseña, pero lee y correlaciona todo el contenido y
puede inyectar en una sesión TCP sin cifrar contra una base **compartida con otros sistemas**.

**Precondiciones.** Posición de red entre el host y el servidor Postgres. **No verificable desde
el repositorio y necesario para dimensionar la parte de credenciales:** el método de
autenticación efectivo (SCRAM vs md5 vs password) y si el servidor soporta TLS —declarado no
auditable ya en SEC-09.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Hacer el modo SSL configurable por entorno en un helper compartido (`configPostgresDesdeEnv` ya centraliza), desplegando con el valor actual para que el cambio sea inerte | Bajo — un helper y cinco llamadas | Parcial hasta que se active, pero elimina el valor cableado y deja el interruptor listo | Muy bajo si se preserva el default actual |
| 2 | Activar TLS con CA del servidor y `rejectUnauthorized: true`, coordinado con el equipo de BD | Medio — requiere que el otro equipo habilite TLS y distribuir la CA | Total para credenciales y datos en tránsito | Medio-alto: si el servidor no soporta TLS, las cinco conexiones fallan a la vez |
| 3 | Túnel cifrado a nivel de infraestructura (stunnel/WireGuard o pgbouncer con TLS), documentado como requerimiento perimetral | Alto — infraestructura nueva fuera del repo | Total sin tocar el código | Alto en disponibilidad: un salto más que, si cae, tumba las cinco rutas |

**Recomendada: 1 ahora, 2 cuando el equipo de BD confirme soporte.**

**Condición del veredicto.** VERIFICADO como hecho, con severidad Baja por un control
compensatorio documental con evidencia: **el valor lo prescribe la especificación de conexión
que entrega el equipo dueño de la base** (`fastapi-postgresql-conexion.md:17`, que lista
`sslmode: disable` junto a `gssencmode: disable`), y el código lo declara explícitamente. No es
una decisión libre de este repositorio. Se registra la corrección aportada por una refutación:
por el canal del collector **no** viajan `retiros.contacto`, `retiros.solicitante` ni
`retiros.ip_origen` —la consulta es `SELECT ambito, clave` (`repositorio-retiros-postgres.js:16-20`)—
ni la tabla `auditoria`, que el collector no toca. **La activación efectiva es EXTERNA: equipo
que administra el Postgres 17 compartido.**

---

### [CPR-007] `fuente-rss.js` bufferiza el feed sin corte de tamaño

**Severidad final: Baja.** **Categoría:** CWE-770 + CWE-400 · OWASP A05:2021
**Componente:** `collector/src/adaptadores/fuente-rss.js` + `cliente-http.js` (`leerTexto`)

**Evidencia.** `fuente-rss.js:25-38` llama a `leerTexto` sin consultar ninguna cabecera de tamaño;
`cliente-http.js:32-34` hace `await respuesta.arrayBuffer()` sin tope. **La remediación de SEC-06
existe en `extractor-contenido.js:258-259`, en `fuente-sitemap-news.js:42-45` y en
`politica-robots.js:69-72`, pero no aquí** — y esta es la ruta de la Fuente 1, la única viva en
producción (Google News está bloqueada por su propio `robots.txt`). Agravantes verificados:
`main.js:265` lanza los 54 feeds a la vez con `Promise.allSettled` sin limitador, y la ventana es
de 200 s (`parametros.js:19`), no de 15.

**Cadena.** Actor **(c)**. Desenlace **cierto**: si el cuerpo supera el límite de string de V8, el
`RangeError` se propaga, `Promise.allSettled` lo captura y `main.js:266-270` escribe
`[FALLO] <medio>`; ese medio no se recolecta esa hora y la corrida sigue. Desenlace **grave y no
garantizado**: el backing store del `ArrayBuffer` es memoria externa, no acotada por el heap de
V8, y `docker-compose.yml` no fija `mem_limit` para el collector (SEC-11, abierto), de modo que
el crecimiento lo detiene el OOM-killer del host con SIGKILL —incapturable—, matando la corrida
antes de persistir y pudiendo arrastrar a `backend` y `app`, que comparten host.

**Precondiciones.** Medio curado comprometido. Ancho de banda suficiente dentro de los 200 s (no
determinable desde el repo). Para el desenlace grave: ausencia de `mem_limit` (confirmada).
**No se requiere `Content-Length` ni chunked: aquí no se consulta ninguna cabecera de tamaño**,
así que el residual documentado de SEC-06 ni siquiera hace falta.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Replicar el corte por `Content-Length` que ya existe en los otros dos adaptadores, con `MAX_BYTES_FEED` (20 MB), lanzando para que quede como `[FALLO] <medio>` | Muy bajo — 4 líneas, copia literal de un patrón ya aprobado | Parcial y conocida (no cubre respuestas sin `Content-Length`), pero elimina la asimetría entre adaptadores | Muy bajo: ningún feed legítimo se acerca a 20 MB |
| 2 | Poner el corte en `leerTexto` leyendo por streaming desde `respuesta.body` y abortando al superar el tope: cubre las cuatro rutas de salida sin depender de cabeceras. Es la opción 2 que SEC-06 recomendaba y se aplicó a medias | Medio — reescribe una función compartida preservando la detección de charset | **Total** e independiente de cabeceras | Medio: `leerTexto` decodifica ISO-8859-1 de la prensa regional; un error corrompe titulares en silencio |
| 3 | Lo anterior más limitar la concurrencia de `main.js:265` con `mapaConLimite` (ya existe en `util-concurrencia.js`) y fijar `mem_limit`/`cpus` al collector | Medio-alto — toca la composición y el compose de producción | Total: acota el pico simultáneo y contiene el radio sobre `backend` y `app` | Medio: serializar alarga la corrida y un `mem_limit` mal dimensionado mata corridas legítimas |

**Recomendada: 1 ya, 2 como cierre.**

**Condición del veredicto.** VERIFICADO: la asimetría fue confirmada archivo por archivo por
tres refutadores. Severidad Baja —igual que SEC-06, no Media— porque el desenlace trazable es el
mismo que aquella auditoría evaluó (`[FALLO]` de un medio, la corrida sigue) y el desenlace grave
depende de `mem_limit`, que es SEC-11, ya abierto y aceptado como acción de DevOps. Se registra
la objeción de una refutación: el mismo actor ya podía forzar esto por la ruta del extractor
omitiendo `Content-Length` (residual aceptado de SEC-06), así que la corrección elimina una
asimetría más que una capacidad.

---

### [CPR-008] `String.fromCodePoint` sin guarda de rango: censura persistente de un medio

**Severidad final: Baja.** **Categoría:** CWE-248 + CWE-20 · OWASP A05:2021
**Componente:** `collector/src/adaptadores/fuente-rss.js:63-70` y
`fuente-sitemap-news.js:146-151` (y `extractor-contenido.js:12-19`, ahí contenido por su
`try/catch`)

**Evidencia y corrección de la cadena.** Tres refutadores intentaron demoler este hallazgo
ejecutando el adaptador real y **los tres fracasaron**, pero dos corrigieron el vector, lo que se
recoge aquí: con la entidad **cruda** `&#1114112;` en un `<title>` de RSS, quien lanza es
`rss-parser` (*"Invalid character entity"*), no el código del repositorio. El defecto de
`fuente-rss.js:68` **sí** es alcanzable con dos variantes medidas: **CDATA**
(`<![CDATA[CONAF &#1114112; x]]>`) y **doble escape** (`&amp;#1114112;`), que devuelven la cadena
literal al código. Y por la ruta del **sitemap** el parser es propio y basado en regex
(`fuente-sitemap-news.js:106-141`), sin librería que intercepte: ahí el `&#1114112;` crudo llega
directo a `String.fromCodePoint` y lanza `RangeError`.

**Cadena.** El actor **(c)** publica esa secuencia. `fuente-rss.js` no tiene ningún `try/catch`,
así que la excepción escapa del adaptador (medido end-to-end con `crearFuenteRss` del repositorio
y un cliente inyectado) y `main.js:266-271` la convierte en `[FALLO] <medio>`: ese medio aporta
**cero ítems** esa corrida aunque su feed tuviera veinte noticias válidas con mención. Por
sitemap, la excepción sube al `try/catch` de `main.js:410-414`. El ítem sigue en el feed mientras
el medio no lo rote, así que **el efecto se repite en cada corrida horaria**. Es censura
silenciosa y persistente de un medio concreto del boletín, activable con 11 caracteres y sin
ningún acceso a CONAF.

**Precondiciones.** Control del contenido de un feed o sitemap de la lista curada. **Nada más**:
no depende de tamaño, de `robots.txt`, de red interna ni de sesión. Nótese que un medio que
quiera dejar de ser monitoreado puede hacerlo él mismo.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Guardar el rango en las tres copias: devolver la coincidencia original si el codepoint no está en `[0, 0x10FFFF]` o cae en `D800-DFFF` | Muy bajo — dos líneas por archivo, funciones puras con tests | Total para este defecto en los tres puntos donde vive | Muy bajo: solo cambia el resultado para entidades que hoy hacen fallar el proceso |
| 2 | Unificar las tres copias en un único helper de dominio testeado que ya incluya la guarda | Bajo-medio — refactor y tests de paridad | Total, y previene la reaparición en una cuarta fuente | Bajo: las tres copias no son idénticas; unificar solo la decodificación acota el cambio |
| 3 | Además, `try/catch` **por ítem** en el bucle de `fuente-rss.js:41-56` y en `parsearSitemapNews`, como ya se hace con los ítems sin link | Medio — toca el flujo de dos adaptadores y su resumen | Total y defensiva ante cualquier excepción futura del parseo por ítem | Medio: convierte fallos hoy ruidosos en descartes silenciosos; hay que conservar el contador en el resumen |

**Recomendada: 1 + 3.**

**Condición del veredicto.** VERIFICADO con la cadena corregida. Es el único hallazgo del lote
con **tres refutaciones SOBREVIVE por el eje de evidencia**, todas tras intentar demolerlo con
ejecución real.

---

### [CPR-009] El truncado de `X-Forwarded-For` descarta la IP no falsificable

**Severidad final: Baja.** **Categoría:** CWE-117 + CWE-778 · OWASP A09:2021
**Componente:** `backend/app/servicios/auditoria.py::origen`

**Evidencia.** `frontend/nginx.conf:14` usa `$proxy_add_x_forwarded_for`, cuyo valor es
`$http_x_forwarded_for, $remote_addr`: **la IP real se anexa al final**. `auditoria.py:35-37` lee
esa cadena, concatena y conserva los **primeros** 200 caracteres. Un relleno de más de 200 bytes
expulsa del corte tanto la IP anexada por nginx como el sufijo de origen directo.

**Cadena.** Un actor de la red interna envía cualquier petición auditada con un
`X-Forwarded-For` de relleno de más de 200 caracteres (nginx admite hasta 8 KB por línea). Lo que
se persiste en `retiros.ip_origen` y `auditoria.ip_origen` es texto **elegido íntegramente por
el atacante**. Alcance: `origen()` es la única fuente de esa columna y la usan los 7 eventos de
login/logout, `RETIRO_SOLICITADO`, `RETIRO_RESUELTO`, los tres de conceptos y los dos de datos
personales.

**Precondiciones.** El atacante alcanza el nginx del repositorio sin que un proxy anterior
**reemplace** (en vez de anexar) la cabecera; se cumple de forma trivial por el puerto publicado
(`docker-compose.yml:66-67`). No hay `set_real_ip_from` ni `real_ip_header` en `nginx.conf`.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Invertir el truncado: construir `f"{directo} <- {cadena}"[:200]`, de modo que el salto no falsificable quede siempre dentro del corte | Bajo — una línea | Alta: garantiza que el último salto se persista siempre | Bajo: cambia el formato de un campo que ningún endpoint devuelve ni ninguna consulta parsea |
| 2 | Dos columnas: `ip_directa` (último salto confiable, tras configurar `set_real_ip_from` para la red Docker) y `xff_declarado`, marcada como no confiable | Medio — migración aditiva siguiendo el bloque `DO $$` ya existente | Total: el dato confiable deja de depender del truncado | Bajo-medio: `set_real_ip_from` mal delimitado haría confiar en cabeceras del cliente |
| 3 | Normalizar y validar: descartar saltos que no sean IPs válidas, recortar a los N últimos y guardar como lista JSON en `detalle` | Alto — parseo nuevo, tests y decisión sobre cuántos proxies se confían | Total, e incluye la neutralización de la inyección de texto arbitrario | Medio-alto: el código eligió `TEXT` sin parseo **a propósito** para que un valor inesperado no aborte el `INSERT` |

**Recomendada: 1.** Una línea, cierra el vector, y es prerequisito de la opción 1 de CPR-004.

**Condición del veredicto.** VERIFICADO: el mecanismo fue confirmado por las cuatro
refutaciones. Severidad Baja porque el impacto declarado ("neutraliza el único control de
rendición de cuentas") es falso: en los eventos autenticados la identidad proviene de la cookie
firmada, no de cabeceras (`datos_personales.py:107-110`, `auth.py:163-165`). Falsificar
`ip_origen` **no le quita al auditor el QUIÉN, solo el DESDE DÓNDE**. El residual queda acotado a
los eventos anónimos y pre-autenticación.

---

### [CPR-010] La supresión de datos personales no es determinista ni declara que quedó truncada

**Severidad final: Baja.** **Categoría:** CWE-20 · OWASP A04:2021 (Insecure Design)
**Componente:** `backend/app/routers/datos_personales.py`

**Evidencia.** `datos_personales.py:73` — `db.query(Noticia).all()` **sin `ORDER BY` y sin
`LIMIT`**; el corte de `LIMITE_COINCIDENCIAS = 200` se aplica en Python (`:77-78`).
`schemas.py:275-277` — `SupresionOut` **no** lleva el campo `truncado` que `DatosPersonalesOut`
sí lleva (`:268-272`, expuesto en `datos_personales.py:116`).

**Cadena.**
1. Un admin emite `GET /api/datos-personales?nombre=XXXX` y revisa las coincidencias.
2. Emite el `DELETE`. Como `_buscar` no tiene `ORDER BY`, Postgres devuelve el orden físico del
   heap, que cambia con cada upsert horario del collector: **si hay más de 200 coincidencias, las
   200 filas que borra no son necesariamente las 200 que revisó.**
3. Ante 5 000 coincidencias reales, la respuesta dice `{"borradas": 200}` **sin ninguna señal**
   de que quedaron 4 800 sin borrar: el titular queda con una supresión parcial declarada como
   completa.

**Precondiciones.** Sesión con rol admin. Volumen no trivial en `noticias`. Para la divergencia,
más de 200 coincidencias y que entre ambas peticiones haya corrido el upsert horario.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | `order_by(Noticia.id)` en `_buscar` y añadir `truncado: bool` a `SupresionOut` y a la respuesta, replicando la línea 116 | Bajo — 4 líneas | Cierra la divergencia GET/DELETE y la supresión silenciosamente parcial | Prácticamente nulo: campo aditivo que ningún consumidor lee (no hay frontend para este endpoint) |
| 2 | Exigir confirmación explícita: `?confirmar=<n>` con el total del GET inmediatamente anterior, y 409 si no coincide | Medio — ~15 líneas y un test | Obliga a pasar por el GET y convierte el borrado por typo en un 409 | Bajo pero real: cambia el contrato del endpoint, que no tiene consumidor en el frontend |
| 3 | Rediseñar la supresión: no borrar la fila completa, sino redactar los campos con el dato personal (`autor` a NULL, fragmentos del extracto), y mover el borrado de fila a una operación aparte por `id` explícito | Alto — rediseño y coordinación con la política de datos | Cierra el problema de raíz: elimina el borrado colateral de noticias que solo mencionan a la persona en el cuerpo | Alto, **y es una DECISIÓN FUNCIONAL a elevar**: cambia qué significa "supresión" en este sistema |

**Recomendada: 1.** La 3 se eleva al mandante y a quien firma la política de datos.

**Condición del veredicto.** VERIFICADO en lo que sobrevive. **Dos pilares del hallazgo original
se demolieron y se registran:** (i) *"no existe confirmación previa ni modo simulación"* es
falso — el `GET` del mismo router **es** el modo simulación, y ejecuta literalmente las mismas
dos llamadas (`:102-103` frente a `:138-139`); lo que falta es **obligarlo**; (ii) *"irreversible
en dos capas"* es falso en su segunda capa: el `Retiro` creado es reversible por diseño explícito
(`servicios/retiros.py:12-14`) mediante el PATCH que limpia `aplicado_en`/`aplicado_por`
(`retiros.py:120-129`). Irreversible es solo el `DELETE` de la fila.

---

### [CPR-011] `GET /api/noticias` lee columnas internas que descarta ante un anónimo

**Severidad final: Baja.** **Categoría:** CWE-405 (Asymmetric Resource Consumption) · OWASP A04:2021
**Componente:** `backend/app/routers/noticias.py` + `db/schema.sql`

**Evidencia.** `noticias.py:65` — `db.query(Noticia)` selecciona **todas** las columnas mapeadas;
no hay `load_only` ni `defer` en `db/models.py:33-66`. Para un anónimo, `fila_a_noticia` retorna
antes de añadir `extracto` y `analisis` (`mapeo.py:64-65`): hasta 1000 documentos JSONB se leen
del Postgres compartido, viajan por la red y **se descartan**. Segundo: el único índice sobre esa
columna es `noticias (fecha DESC)` (`db/schema.sql:58`), que en Postgres es **NULLS FIRST**,
mientras el `ORDER BY` pide `DESC NULLS LAST` (`noticias.py:57`), y ninguna clave adicional del
orden (`fecha_deteccion`, `id`) está en el índice: **un ordenamiento es inevitable.** Verificado
por dos refutadores.

**Cadena.** Un anónimo con alcance de red repite la petición; cada una paga el ordenamiento, la
lectura de JSONB descartado, `claves_retiradas`, la tabla `conceptos` completa y la validación de
hasta 1000 modelos Pydantic, sin amortiguación posible porque la respuesta lleva
`Cache-Control: no-store` (`noticias.py:40`). Con `pool_size=5 + max_overflow=5` y `--workers 2`
hay 20 conexiones en total.

**Precondiciones.** Alcance de red sin credenciales. `TAMANO_VENTANA` en su valor por defecto de
1000. Volumen apreciable en `noticias`.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | `load_only`/`defer` sobre `extracto` y `analisis` cuando `sesion is None` | Bajo-medio — cambio localizado en `noticias.py:65` | Alta sobre el coste dominante | **Medio, y hay que hacerlo con cuidado**: `mapeo.py` es la frontera única de exposición; proyectar por superficie introduce un segundo lugar donde la separación puede romperse |
| 2 | Añadir el índice que el `ORDER BY` pide: `ON noticias (fecha DESC NULLS LAST, fecha_deteccion DESC, id ASC)` al final de `db/schema.sql` | Medio — una sentencia aditiva respetando el patrón de migraciones | Alta sobre el ordenamiento, y el beneficio crece con la tabla | Bajo-medio: es aditivo y `CREATE INDEX IF NOT EXISTS` toma ShareLock, pero el archivo se ejecuta en **cada corrida horaria** |
| 3 | Cachear la carga útil pública 60 s en el backend o en nginx, sustituyendo `no-store` por `s-maxage` solo en la rama sin sesión | Alto — y hay que garantizar que la variante autenticada nunca se sirva desde la caché pública | Total contra la repetición | **Alto y con implicancia funcional**: el sistema promete efecto *inmediato* al aplicar un retiro en ambas superficies; cachear lo rompe |

**Recomendada: 2, y 1 con revisión cuidadosa de la frontera de `mapeo.py`.** La 3 se descarta por
colisionar con un requisito declarado.

**Condición del veredicto.** VERIFICADO como ineficiencia con impacto de disponibilidad, no como
fuga: la separación de superficies **se sostiene** (el dato se descarta antes de salir).
Severidad Baja porque una refutación demolió con evidencia la premisa que sostenía Media —*"la
tabla crece monótonamente"* es **falsa**: la purga diaria (`crontab:22`) borra la fila a los 400
días—, el factor de amplificación por petición es 1× (es el mismo coste de una visita legítima) y
el habilitador real, la ausencia de rate limiting, es un requerimiento perimetral ya abierto
(`DESPLIEGUE.md:128`).

---

### [CPR-012] El artefacto desplegado no es el que CI audita

**Severidad final: Informativa.** *Consolida `gate-auditoria-no-vincula-artefacto-desplegado` con
la divergencia de versión de Python descubierta **por un refutador**, no por el auditor.*
**Categoría:** CWE-1357 + CWE-494 · OWASP A08:2021
**Componente:** `.github/workflows/ci.yml` + `backend/Dockerfile` + `backend/requirements.txt`

**Evidencia — verificada por mí directamente.** `backend/Dockerfile:4-5`:

```dockerfile
# Python 3.11 slim como imagen base
FROM python:3.14-slim
```

Mientras `.github/workflows/ci.yml:99` fija `python-version: '3.11'`. **CI ejecuta `pytest` y
`pip-audit` sobre Python 3.11; la imagen que llega a producción se construye sobre 3.14, y el
comentario de la línea 4 quedó desactualizado.** El auditor citó esta línea como `3.11-slim` —era
incorrecto— y un refutador lo detectó al comprobar la cita contra el archivo.

Segunda evidencia: `docker-compose.yml:19-21` usa `build:`, no `image:`; el `docker build` de CI
(`ci.yml:119`) no publica a ningún registro (`grep "push|registry|ghcr|docker login"` sobre
`ci.yml` → sin coincidencias), y el reusable reconstruye en el runner (`ci.yml:131-132`). Como
`requirements.txt` solo declara rangos (`httpx>=0.28,<1.0` en `:9`, `itsdangerous>=2.2,<3.0` en
`:14`) y **no existe lockfile de Python ni `--require-hashes`**, `pip` resuelve de nuevo en el
instante del deploy. En v3 esas dos dependencias son precisamente las críticas: `httpx` transporta
el `CLIENT_SECRET` al IAM e `itsdangerous` **firma la cookie de sesión**; ninguna existía en v2
(confirmado con `git log -S`).

**Precondiciones.** Que una dependencia dentro de los rangos sea comprometida en la ventana entre
la auditoría de CI y el deploy. Que el reusable reconstruya en el servidor (se infiere del
comentario de `ci.yml:131-132`).

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Alinear la versión de Python entre `ci.yml:99` y `backend/Dockerfile:5`, y corregir el comentario de la línea 4 | Muy bajo — dos líneas | Cierra la divergencia concreta y verificable: los tests pasan a correr sobre el intérprete que se despliega | Bajo, **con una comprobación obligatoria**: `pytest` debe pasar en la versión elegida antes de fijarla |
| 2 | Lockfile de Python: `pip-compile --generate-hashes`, instalar con `--require-hashes` y apuntar `pip-audit` al lockfile | Medio — introduce pip-tools en el flujo y ajusta dependabot | Alta sobre reproducibilidad: un paquete sustituido hace fallar el build en vez de entrar a producción | Medio: `--require-hashes` es estricto y hay que verificar el hash del wheel de `psycopg2-binary` para la plataforma |
| 3 | Construir una sola vez en CI, publicar las imágenes a un registro con digest, y que el runner haga `docker compose pull`. El artefacto auditado y el desplegado pasan a ser el mismo por construcción | Alto — registro, credenciales y modificar el reusable (otro repositorio) | Total sobre la causa raíz y sobre la trazabilidad commit→imagen→contenedor (**cierra también CPR-016**) | Alto: el registro pasa a ser dependencia de disponibilidad, incluida la recreación de contenedores a las 8:00 |

**Recomendada: 1 de inmediato; 2 a continuación.**

**Condición del veredicto.** VERIFICADO **solo** en su mitad Python y en la divergencia de
intérprete. **La mitad JavaScript se demolió y se registra:** ambos lockfiles están versionados y,
con `package-lock.json` presente y sincronizado, `npm install` instala el árbol del lockfile
verificando el `integrity` sha512 de cada tarball —no resuelve libremente—; además CI usa
`npm ci` en ambos jobs. La auditoría anterior ya lo había dictaminado como no-hallazgo
(`SEGURIDAD.md:641` del anexo B). Severidad Informativa porque la mitad que sobrevive es el
residual de SEC-14 ya aceptado como acción de DevOps, sin cadena de explotación demostrada.

---

### [CPR-013] Listas de entrada sin tope y dos `500` no capturados

**Severidad final: Informativa.** *Consolida `listas-de-entrada-sin-tope` e
`int-sin-try-en-reordenar-conceptos`: misma causa raíz —validación de entrada delegada a la base
o a `int()`— en dos endpoints hermanos.*
**Categoría:** CWE-770 + CWE-248 · OWASP A04:2021
**Componente:** `backend/app/schemas.py` + `backend/app/routers/conceptos.py`

**Evidencia.** `schemas.py:126` y `:131` — `list[...]` **sin `Field(max_length=...)`**.
`schemas.py:121` — `id: str` sin patrón ni validador, mientras `conceptos.py:147` hace
`int(item.id)` **sin `try`**. `conceptos.py:196-205` — `fijar_tipos_ocultos` comprueba el
concepto (404) pero **no** el `seccion_id`: la única lista blanca es la FK
`REFERENCES secciones(id)` (`db/schema.sql:359`), y el `commit` no captura `IntegrityError`.
`grep` sobre todo `backend/` → **no hay ningún `exception_handler` ni `add_middleware`**: ambas
excepciones salen como `500` genéricos.

**Cadena.** Un admin autenticado envía un `seccion_id` inexistente (→ `IntegrityError` → 500) o un
`id` no numérico en `/orden` (→ `ValueError` → 500). Ningún estado queda inconsistente: el
`int()` precede al `commit`, el commit fallido revierte y `get_db` cierra en `finally`.

**Precondiciones.** **Sesión válida con rol admin** y, con `ORIGENES_PERMITIDOS` puesto, `Origin`
permitido o ausente. El frontend nunca genera estos cuerpos.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | `Field(max_length=50)` en `tiposOcultos` y `max_length=500` en `items`, más `max_length` a los elementos | Muy bajo — 3 líneas | Cierra el consumo de memoria y conexiones; no convierte los 500 en 422 | Muy bajo con topes holgados (`MAX_ACTIVOS_POR_TIPO = 100`) |
| 2 | Validar contra el catálogo antes de escribir (la consulta ya existe en `listar`) y envolver la conversión de `:147` en `try/except` → 422 | Bajo — ~10 líneas y dos tests | Convierte los dos 500 en errores de cliente correctos | Bajo: añade una consulta sobre una tabla de pocas filas fuera del camino caliente |
| 3 | Manejador global de `IntegrityError`/`ValueError` a 409/422, más `client_max_body_size 256k` en el bloque `location /api/` | Medio — manejador y directiva de nginx | Cubre esta clase en todos los endpoints presentes y futuros | Medio: un manejador global puede enmascarar errores que hoy conviene ver; `client_max_body_size` mal dimensionado rompe POST legítimos |

**Recomendada: 1 + 2.**

**Condición del veredicto.** VERIFICADO como defecto de robustez, degradado a Informativa por
**precondición**: las ocho refutaciones coincidieron en que el actor requerido es un admin
autenticado —el de máxima confianza del sistema—, que por la vía legítima ya puede desactivar
cualquier concepto. Provocarse a sí mismo un 500 no le aporta nada. Se registra además una
contradicción interna detectada: la cadena afirmaba a la vez que el `INSERT` "aborta en la
primera violación de FK" y que retiene una conexión "hasta el `statement_timeout`"; ambas no
pueden ser ciertas.

---

### [CPR-014] Crear, actualizar y eliminar conceptos se auditan sin IP

**Severidad final: Informativa.** **Categoría:** CWE-778 · OWASP A09:2021
**Componente:** `backend/app/routers/conceptos.py`

**Evidencia.** `crear` (`:216-221`), `actualizar` (`:289-294`) y `eliminar` (`:334-338`) **no
declaran `request: Request`**, a diferencia de `reordenar_conceptos` (`:141-146`),
`reordenar_tipos` (`:162-167`) y `fijar_tipos_ocultos` (`:188-194`), que sí lo hacen y pasan
`ip=auditoria.origen(request)` (`:155`, `:182`, `:209`). Sus tres llamadas a `registrar` (`:280`,
`:325`, `:351`) omiten `ip=`, cuyo default es `""` (`auditoria.py:45`). Las filas de
`CONCEPTO_CREADO`, `CONCEPTO_ACTUALIZADO` y `CONCEPTO_ELIMINADO` quedan con `ip_origen` vacío
—precisamente los eventos que `db/schema.sql:136-139` declara como los que más importan.

**Precondiciones.** Que ocurra un incidente sobre conceptos y se quiera investigar. Acceso directo
a Postgres, ya que la aplicación no expone `auditoria`.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Añadir `request: Request` a las tres firmas e `ip=auditoria.origen(request)` a sus llamadas, como ya hace `reordenar_conceptos:155` | Muy bajo — 6 líneas; `Request` ya está importado | Cierra la asimetría por completo | Prácticamente nulo |
| 2 | Capturar el origen en `requerir_admin_escritura` —que ya recibe `request`— y guardarlo en `request.state`, para que un endpoint nuevo no pueda olvidarlo | Bajo-medio — toca `dependencias.py`, el dataclass `Sesion` y ~10 llamadas | Cierra el hallazgo **y la clase de defecto** | Bajo: `Sesion` es `frozen`, así que añadir un campo obliga a revisar `_a_sesion` y los tests |
| 3 | Endpoint `GET /api/auditoria` solo-admin, paginado y filtrable, para que la traza sea consultable desde la aplicación | Alto — router, schema, paginación y tests | Convierte la traza en un control operativo real | Medio-alto, **con un conflicto a elevar**: exponer `auditoria` expone también la PII que acumula (ver CPR-005) |

**Recomendada: 2.** Elimina la posibilidad estructural de repetir el olvido.

**Condición del veredicto.** VERIFICADO (una refutación SOBREVIVE tras buscar sin éxito cualquier
vía por la que la IP llegara igual: no hay middleware). Informativa porque la atribución **no**
se pierde: las tres llamadas conservan `usuario`, `sub` y `rol`; la fila de `conceptos` guarda
`actualizado_por`/`actualizado_en`; el borrado es **suave** (`:345-348`); existe correlación por
`usuario_sub` contra el `LOGIN_OK`, que sí registra IP (`auth.py:163-164`); y el escenario de
impacto está bloqueado por `_exigir_que_quede_alguno_de_busqueda`, que devuelve 409 antes de
dejar vacía la lista de inclusión.

---

### [CPR-015] Patrones de exclusión de secretos por nombre exacto

**Severidad final: Informativa.** **Categoría:** CWE-540 · OWASP A05:2021
**Componente:** `.gitignore` + `.dockerignore` + `.github/workflows/ci.yml`

**Evidencia.** `.gitignore:18-21` cubre `.env`, `.env.dev` y `.env.*.local`. Reproducido por un
refutador: `git check-ignore -v .env.local .env.production .env.bak backend/.env frontend/.env.local .env.example`
confirma que **solo** emparejan `backend/.env` y `frontend/.env.local`; `.env.local`,
`.env.production` y `.env.bak` en la raíz **no están ignorados**. `.env.production` es además la
convención nativa de Vite, el bundler de este frontend. El único guardián de CI (`ci.yml:59-60`)
busca densidad de enlaces a notas de prensa, **no secretos**.

**Cadena.** Un desarrollador crea `.env.produccion` o `.env.bak`, hace `git add .` y el archivo
entra al árbol. Impacto potencial: `CLIENT_SECRET`, `SESSION_SECRET` —que permitiría **forjar
cookies con rol admin**, porque la cookie está firmada y no cifrada— y las credenciales del
Postgres compartido. El repositorio está explícitamente pensado para publicarse (`README.md:10`).

**Precondiciones.** **Error humano**: no hay ninguna ruta automática que ponga un secreto en el
árbol. Nunca se ha materializado: `git ls-files | grep -i env` devuelve solo `.env.example`.

**Remediación.**

| # | Opción | Esfuerzo | Cobertura | Riesgo de regresión |
|---|--------|----------|-----------|---------------------|
| 1 | Convertir la enumeración en patrón: `.env`, `.env.*` y `!.env.example` en `.gitignore`; `**/.env` y `**/.env.*` en `.dockerignore` | Muy bajo — 5 líneas | Alta y preventiva sobre ambas facetas | Muy bajo, **con una comprobación obligatoria**: sin `!.env.example`, el patrón dejaría de rastrear el único documento que describe la configuración |
| 2 | Segunda guarda en el job `contenido` (que ya es `needs:` del deploy): fallar si `git ls-files` devuelve cualquier ruta `.env*` distinta de `.env.example` | Bajo-medio — un script en el estilo del existente | Alta: convierte el control preventivo en compuerta de deploy | Bajo-medio: un detector de entropía mal calibrado dejaría el CI en rojo y alguien lo desactivaría |
| 3 | Gestor de secretos o `gitleaks` como hook de pre-commit institucional, y sacar los secretos del `.env` hacia docker secrets | Alto — decisión organizacional | Total: elimina la clase entera de fallo | Alto: migrar de `env_file` cambia cómo el backend lee su configuración |

**Recomendada: 1 + 2.**

**Condición del veredicto.** VERIFICADO en su faceta de control de versiones, con la semántica
reproducida por comando. Informativa —y no Baja— porque **la faceta del contexto de build de
Docker quedó demolida**: no existe publicación a ningún registro, así que una imagen con un
`.env` horneado nunca abandona el mismo host que ya tiene el `.env` real montado; y
`load_dotenv()` se invoca sin argumentos, con `override=False`, de modo que las variables
inyectadas por `env_file` ganan. Se registra también un uso indebido de cita del auditor: el
`cp .env ~/env.bak` de `DESPLIEGUE.md:81` ocurre **en el servidor**, no en el árbol versionado.

---

## 3. INDETERMINADOS y EXTERNOS

### [CPR-016] Deploy a producción sin compuerta humana — INDETERMINADO

**Componente:** `.github/workflows/ci.yml` (job `deploy`)

**Hecho verificado:** el job `deploy` (`ci.yml:121-135`) no declara `environment:` —la cadena no
aparece en el archivo— y su `if` (`:123`) se satisface con cualquier push a `main`. En v3 ese
pipeline despliega el contenedor que recibe por `env_file: .env` el `CLIENT_SECRET` y el
`SESSION_SECRET`.

**Por qué es INDETERMINADO y no VERIFICADO.** Una refutación aportó un argumento técnico que no
se puede cerrar desde este repositorio: **el job `deploy` no es un job normal, es una llamada a
un workflow reusable** (`uses:` + `with:`, sin `steps:`). En un job que llama a un reusable,
`environment` no es una clave admitida en el *caller*: el environment, con sus required
reviewers, se declara **dentro de los jobs del workflow llamado**, que vive en
`Sud-Austral/infra-docker-base` y es una dependencia opaca. **Desde aquí no es verificable que no
exista compuerta humana.** A ello se suma que la precondición del paso 1 —un actor con permiso de
push a `main`— es la que la auditoría anterior ya juzgó como "actor confiado" (anexo B, SEC-10).

**Qué dato exacto lo resuelve.** Tres comandos, ejecutados por alguien con permiso de
administración del repositorio:

```bash
gh api repos/Sud-Austral/coipo_prensa2/branches/main/protection
gh api repos/Sud-Austral/coipo_prensa2/collaborators --jq '.[] | {login, permissions}'
gh api repos/Sud-Austral/coipo_prensa2/actions/runners
```

- Si el primero devuelve `404 Branch not protected`, el push directo a `main` es posible y la
  cadena queda completa → severidad **Baja**. Si devuelve
  `required_approving_review_count >= 1` con `enforce_admins: true`, la cadena exige un segundo
  revisor negligente → **Informativa**.
- El tercero decide un agravante: **si el runner self-hosted está a nivel de organización,
  cualquier repositorio de `Sud-Austral` puede ejecutar código en el servidor de CONAF**, lo que
  elevaría el hallazgo por encima de lo anterior.

Además, hace falta leer `infra-docker-base@db5f79c5` para saber si declara `environment` en sus
propios jobs.

---

### [CPR-017] El cerrojo `PERMITIR_SIN_ASIGNACION` es una lista negra de un literal — INDETERMINADO

**Componente:** `backend/app/routers/auth.py:154-157` + `servicios/iam.py:121-123`

**Hecho verificado:** la única comprobación de autorización de entrada compara contra un literal
—`if rol == "general" and not config.PERMITIR_SIN_ASIGNACION`— en vez de usar una lista blanca de
roles admitidos, y `role` **no se valida en ningún punto** del backend: `obtener_userinfo` solo
exige `info.get("sub")` (`iam.py:121-122`). Si `/oauth/userinfo` respondiera 200 sin `role`, la
expresión produciría cadena vacía, la condición sería falsa y el cerrojo se saltaría, creando
sesión con rol `""` —que `verificar_sesion` acepta— y acceso a toda la superficie interna de
lectura.

**Por qué es INDETERMINADO.** El disparador depende del contrato de `/oauth/userinfo`, que vive
en `COIPO_USUARIOS`. Y la única evidencia disponible **lo contradice**: `docs/AUTENTICACION.md:18-19`
afirma que `'general'` es precisamente el valor que el IAM devuelve **por defecto** a quien no
tiene asignación, es decir, el campo viene poblado justo en el caso que el cerrojo debe atrapar.

**Qué dato exacto lo resuelve.**

```bash
curl -H 'Authorization: Bearer <token de un usuario sin asignación>' https://iam.conaf.cl/oauth/userinfo
```

Confirmar si `role` es siempre una cadena no vacía en un 200. Alternativamente, leer el
constructor de la respuesta en `COIPO_USUARIOS` (`oauth_service.py` / `oauth/router.py`).

**Nota para la etapa 2.** La remediación 1 —invertir a lista blanca: admitir solo si el rol
pertenece a `ROLES_ADMIN ∪ {'general'}` y rechazar cualquier otro valor, incluido el vacío—
**cuesta 2 o 3 líneas y no depende del IAM**. Puede aplicarse por robustez con independencia de
cómo se resuelva la indeterminación, verificando antes que el IAM no devuelva hoy algún rol
legítimo fuera de ese conjunto.

---

### [CPR-018] El flujo Authorization Code no usa PKCE — EXTERNO

**Destinatario: equipo de COIPO_USUARIOS (IAM).**

**Hecho verificado:** `git grep -n -i -E "code_challenge|pkce|code_verifier"` devuelve **cero
coincidencias**; `/authorize` se arma solo con `client_id`, `redirect_uri`, `response_type` y
`state` (`auth.py:95-102`).

**Por qué es EXTERNO y no VERIFICADO.** El único vector que el hallazgo situaba **dentro de este
repositorio** —el `?code=` escrito en el access_log de nginx— quedó demolido por precondición:
leer ese log exige acceso al demonio Docker del servidor, y ese mismo acceso entrega el `.env`
completo (`docker-compose.yml:22`), es decir el `SESSION_SECRET` con el que se firman las
cookies: **el atacante ya ganó antes de llegar aquí**. Además, la mitigación propuesta
(`access_log off`) no cerraría el vector, porque uvicorn registra por su cuenta la línea de
petición. Y este es un cliente **confidencial** con patrón BFF: el canje va server-to-server con
`client_secret` (`iam.py:62-70`), de modo que la prueba de posesión que PKCE aporta a los
clientes públicos ya existe.

Activar PKCE requiere que el IAM soporte `code_challenge` S256; no es una acción de este equipo.
Lo que sí corresponde elevar al equipo del IAM, citado en `docs/AUTENTICACION.md:76-83`, es
**que `/oauth/token` trate el `client_secret` como opcional** y la política de invalidación del
código tras un canje fallido.

---

## 4. Descartados

Se archivan con su motivo; no se borran. **La etapa 2 no debe relitigarlos sin evidencia nueva.**

| ID | Hallazgo propuesto | Motivo del descarte (con evidencia) |
|----|--------------------|--------------------------------------|
| CPR-019 | `redirect_uri` deducida de `X-Forwarded-Host`/`Host` cuando `IAM_REDIRECT_URI` está vacía → open redirect | **Aporte marginal cero** (3 refutaciones DEMOLIDO). Una cabecera HTTP no se puede inducir en la navegación de la víctima: el atacante la envía en **su propia** petición y lo que recibe es una cadena de texto. Esa URL de `/oauth/authorize` la puede escribir a mano sin tocar esta aplicación, porque el `client_id` es público — es el ataque que `docs/AUTENTICACION.md:79-83` ya documenta. Además la categoría CWE-601 es incorrecta: el 303 apunta **siempre** a `config.IAM_URL` (`auth.py:103`); la cabecera solo influye en un *parámetro* |
| CPR-020 | Clickjacking: nginx sin `X-Frame-Options`/`frame-ancestors` con acciones admin de un clic | **Cadena rota en dos puntos independientes** (2 DEMOLIDO + 2 DEGRADADO). (i) La cookie lleva `samesite="lax"` (`seguridad.py:154`): en un iframe **cross-site** el "site for cookies" es el del top-level, así que el navegador no la adjunta ni al cargar el frame ni a las peticiones que salgan de él — dentro del iframe la víctima aparece como **anónima**. (ii) Sin cookie, `editable` lo fija el **backend** (`conceptos.py:130`, `sesion.es_admin`) y el frontend lo consume en `PanelConceptos.jsx:60`: **el botón ni siquiera se renderiza**. Se registra además que el DELETE es un borrado **suave** (`conceptos.py:346`), reversible. La ausencia de cabeceras sigue abierta como SEC-12 (anexo B) |
| CPR-021 | DNS-rebinding residual en `fetchSeguro` | **Relitigación sin evidencia nueva** (principio 6; 2 DEMOLIDO). El residual ya fue consignado y aceptado al cerrar SEC-03 (anexo B: *"Residual: DNS-rebinding parcial"*) y está autodocumentado en `fetch-seguro.js:13-14`. Es el mismo archivo, la misma función y el mismo alcance —no un punto análogo no cubierto—. El propio autor lo declaró `listo=false` con tres eslabones sin medir. **Su remediación ya está presupuestada como opción 3 de CPR-003** |
| CPR-022 | Paginación profunda en `/api/historico` (`pagina` sin cota superior) | **Ya refutado en la auditoría anterior con el mismo argumento** (anexo B, tabla de descartes) y sin evidencia nueva: en Postgres `OFFSET` es O(min(offset, filas_producidas)); el ejecutor se detiene cuando la fuente se agota. Además `total = consulta.count()` (`historico.py:71`) se paga **en toda petición**, con `pagina=1` o con `pagina=1e8`, y `statement_timeout=15000` fija el techo de daño con independencia del plan. Residual: higiene de validación (CWE-1284), sin multiplicador de DoS |
| CPR-023 | El traceback de SQLAlchemy vuelca `[SQL: …] [parameters: …]` con PII al stdout | **La mecánica es falsa, refutada con ejecución real** (2 DEGRADADO por evidencia). `psycopg2` lanza un `ValueError` **plano** ante el byte NUL, que no es subclase de `psycopg2.Error`; y SQLAlchemy solo construye el `DBAPIError` que anexa `[SQL:]`/`[parameters:]` si `should_wrap` es cierto, lo que exige `isinstance(e, dbapi.Error)` o `context is None` — y en `_exec_single_context` el context nunca es None. Con `should_wrap` falso la excepción se re-lanza cruda: **no hay volcado de parámetros**. El camino que sí expone PII ajena exige un fallo fortuito de la base durante el `INSERT` de auditoría, que el atacante no provoca. *Nota: pasar `hide_parameters=True` a `create_engine` sigue siendo una mejora barata, pero no cierra un hallazgo* |

### Descartados por la configuración confirmada de producción

Cuatro candidatos murieron antes de emitirse, por la declaración del mandante. Se listan para que
no se relevanten:

| Candidato | Por qué no aplica |
|---|---|
| Cookie de sesión sin flag `Secure` | `SESION_HTTPS_ONLY=true` confirmado. El default del código es `false` (`config.py:150`) y nginx envía siempre `X-Forwarded-Proto: http`, así que el código no puede deducirlo: **depende enteramente del `.env`** |
| CSRF por verificación de `Origin` inactiva | `ORIGENES_PERMITIDOS` definido, confirmado. Además `SameSite=Lax` ya impide que un POST cross-site lleve la cookie, y el propio código documenta que una petición **sin** `Origin` se deja pasar por ser cliente no-navegador (`dependencias.py:108-109`) |
| Cualquier usuario del IAM entra a la superficie interna | `PERMITIR_SIN_ASIGNACION=false` e `IAM_APP_ID` fijado, confirmados. El residual de forma, no de configuración, se mantiene abierto como **CPR-017** |
| `SESSION_SECRET` derivado del `CLIENT_SECRET` por PBKDF2 con salt fijo | `SESSION_SECRET` propio ≥32 caracteres, confirmado (`config.py:123-132` no se ejecuta). El placeholder publicado `"COIPO_PRENSA_SIN_SECRETO_CONFIGURADO"` (`seguridad.py:44`) es inalcanzable: `verificar_sesion` falla cerrado si `CONFIGURACION_OK` es falso (`seguridad.py:121`) |

---

## 5. Anexo A — cobertura

### Qué se revisó

- **Backend completo**: los 21 endpoints inventariados con su guard exacto; `auth.py`,
  `seguridad.py`, `iam.py`, `dependencias.py`, `config.py`, `schemas.py`, `mapeo.py`,
  `auditoria.py`, los 8 routers, `db/` completo y `db/schema.sql`.
- **Collector**: las 16 rutas de `adaptadores/`, `main.js`, `purga.js`, `parametros.js`,
  `dominio/robots.js`, `noticia.js`, `menciones.js`, `conceptos.js`, `crontab` y el entrypoint.
- **Frontend**: `App.jsx`, `RutaProtegida.jsx`, `ProveedorDatos.jsx`, `ProveedorSesion.jsx`,
  `NoticiaItem.jsx`, `PanelConceptos.jsx`, `PanelRetiros.jsx`, `historico-local.js`, los
  servicios de API, `index.html` y `vite.config.js`.
- **Infraestructura**: `docker-compose.yml` y `.dev.yml`, los 3 Dockerfiles, `nginx.conf`,
  `ci.yml`, `dependabot.yml`, `.gitignore`, `.dockerignore`, `.env.example`, los tres manifiestos
  de dependencias y el **historial completo de git** (pickaxe de secretos sobre todas las ramas).

### Qué NO se revisó, y por qué

- **La fase CAZADOR no se ejecutó.** Estaba diseñada para abrir los archivos que ningún auditor
  citó y quedó interrumpida por una caída del proceso; el mandante decidió cerrar la auditoría con
  el material ya producido en vez de repetir el gasto. **Consecuencia declarada:** quedan sin
  revisar `backend/tests/` (8 archivos, incluido el `conftest.py` que falsifica la base con un
  intérprete parcial de SQL), 17 módulos de `collector/src/dominio/` que procesan texto remoto
  —`analisis-texto.js`, `entidades.js`, `geografia.js`, `categorias.js` son superficie ReDoS
  plausible, del mismo tipo que CPR-001—, `util-concurrencia.js`, `config/medios.js` y los
  gazetteers, y 9 vistas de `frontend/src/vistas/`. **Recomendación explícita: ejecutar esa fase
  antes de dar la auditoría por completa.**
- **`scripts/servidor-stub.mjs`**: se registró que hace `listen(PUERTO)` sin argumento de host
  —escucha en `0.0.0.0`, no en loopback, pese a que su mensaje dice `localhost`— y que sirve una
  sesión **admin** falsa (`:65-71`). No se emitió como hallazgo porque es herramienta de
  desarrollo que no se despliega (`.dockerignore`) y lleva su propia advertencia (`:23`). **Se
  deja anotado para la etapa 2.**
- **Pasos internos del reusable** `Sud-Austral/infra-docker-base@db5f79c5`: no está en este
  repositorio. Bloquea CPR-016.
- **Contrato de `/oauth/userinfo` y `/oauth/token`** del IAM: otro repositorio. Bloquea CPR-017 y
  CPR-018.
- **Configuración del Postgres compartido** (`pg_hba.conf`, método de autenticación, soporte TLS)
  y del reverse proxy externo (TLS, rate limiting, cabeceras). Dimensiona CPR-006 y CPR-004.
- **Reproducción activa de exploits contra infraestructura**: prohibida por la restricción de solo
  lectura. Las mediciones de CPR-001, CPR-003 y CPR-008 se hicieron ejecutando **funciones puras
  del repositorio en memoria**, sin red y sin escribir archivos.

### Iteraciones y motivo de cierre

Una iteración completa de AUDITOR → REFUTADOR → JUEZ. El loop **no** se cerró por convergencia
—no llegó a agotarse—, sino **por decisión del mandante** de no financiar la fase CAZADOR tras la
caída del proceso que la interrumpió a mitad de ejecución. De las tres condiciones de cierre del
contrato, se cumple una (ninguna refutación prosperó hasta invalidar el método) y quedan dos sin
comprobar. **El anexo de cobertura de arriba es, por tanto, parte del veredicto y no una nota al
pie.**

### Nota metodológica

Ningún rol se autoevaluó: los refutadores no vieron los hallazgos de su propio auditor hasta
recibirlos como lote, y el juez adjudicó sobre lo escrito. Cuatro afirmaciones del auditor fueron
corregidas por refutadores con evidencia y las correcciones están incorporadas al texto de los
hallazgos: la versión de Python de `backend/Dockerfile:5` (CPR-012), el vector real de la entidad
inválida en RSS (CPR-008), la premisa de crecimiento monótono de `noticias` (CPR-011) y la
reversibilidad del retiro creado por la supresión (CPR-010). **Una cita del auditor resultó ser
incorrecta contra el archivo** (`python:3.11-slim` donde el archivo dice `3.14-slim`), y de esa
corrección salió un hallazgo que el auditor no había visto.

---

## Anexo B — Auditoría 2026-08-02 (serie SEC), estado preservado

> Se conserva porque `REMEDIACION.md`, `DESPLIEGUE.md` y los comentarios del código
> (`SEC-02` en `routers/historico.py:24` y `db/session.py:19`; `SEC-07` en `routers/salud.py:24`,
> `config.py:185` y `schemas.py:301`; `SEC-04` en `dominio/noticia.js:16`; `SEC-09` en
> `docker-compose.yml`; `SEC-14` en `requirements-dev.txt`) siguen refiriéndose a estos
> identificadores. **El contexto del sistema que encabezaba aquel informe ya no es válido**: decía
> *"Autenticación actual: ninguna"* y *"No hay PII ni credenciales de usuario"*, premisas que la
> v3 rompió. El detalle íntegro de cada hallazgo cerrado permanece en el historial:
> `git show <sha anterior>:SEGURIDAD.md`.

### Estado de remediación

| ID | Hallazgo | Sev. | Estado | Commit |
|----|----------|------|--------|--------|
| SEC-01 | ReDoS en el parseo de HTML del recolector | Alta | YA CORREGIDO | (previo) |
| SEC-02 | DoS en `GET /api/historico` (rango sin cota + `count()` sin índice ni timeout) | Media | CORREGIDO | `7a518fb` |
| SEC-03 | SSRF: `fetch` server-side con `redirect:follow` | Media | CORREGIDO — **residual: DNS-rebinding parcial** | `3839373` |
| SEC-04 | Cadena XSS: `noticia.url` sin allowlist de esquema → `href` | Baja | CORREGIDO | `d7babd2` |
| ~~SEC-05~~ | ~~Inyección de fórmulas CSV~~ | — | **NO APLICA**: la exportación CSV se eliminó por completo | `24e1d92` |
| SEC-06 | Descarga sin límite de tamaño → agotamiento de memoria | Baja | CORREGIDO (parcial) — **residual: sin `Content-Length`/chunked evade** | `047227a` |
| SEC-07 | `GET /health` filtra la excepción cruda de la BD | Baja | CORREGIDO | `312a488` |
| SEC-08 | Beacon/fuga de metadatos vía `img src` | Baja | CORREGIDO | `a7fa92a` |
| SEC-09 | Topología interna + IP de producción en el repo | Baja | CORREGIDO — **residual: la IP sigue en el historial de git** | `49caaab` |
| SEC-10 | CI/CD: reusable anclado a `@main`, sin `permissions:`, auto-deploy sin aprobación | Baja | **HECHO (2026-08-04)**: reusable y actions fijados a SHA, permisos mínimos, deploy condicionado a CI verde | `63ff2a8` |
| SEC-11 | Contenedores como root, sin endurecimiento ni límites de recursos | Baja | **ABIERTO** — acción manual de DevOps | — |
| SEC-12 | nginx sirve la SPA sin cabeceras de seguridad (CSP, X-CTO, X-Frame, Referrer) | Baja | **ABIERTO** — acción manual de DevOps | — |
| SEC-13 | Dev: puerto 5432 publicado + credenciales por defecto `coipo/coipo` | Baja | **ABIERTO** — acción manual de Desarrollo | — |
| SEC-14 | Higiene de cadena de suministro | Baja | **PARCIAL**: la parte de CI hecha (2026-08-04). Pendiente: supercronic por SHA-256, imágenes base por digest, `npm ci` en Dockerfiles, lockfile de Python | — |

### Cómo se relacionan con la serie CPR

- **SEC-11** amplifica el desenlace grave de **CPR-007** (sin `mem_limit`, el OOM-killer puede
  arrastrar a `backend` y `app`).
- **SEC-12** sigue abierto por sí mismo; su faceta de clickjacking se evaluó en v3 y quedó
  **descartada** como CPR-020 (`SameSite=Lax` rompe la cadena).
- **SEC-14** se reevaluó bajo el contexto v3 y su parte viva es **CPR-012**; su mitad JavaScript
  se confirmó como no-hallazgo por segunda vez.
- **SEC-03** cerró con un residual que **CPR-021** intentó reabrir sin evidencia nueva y fue
  descartado; la corrección de raíz está presupuestada como opción 3 de **CPR-003**.
- **SEC-06** cerró parcialmente, y **CPR-007** documenta el punto análogo que la remediación no
  cubrió.
- **SEC-01** cerró en `extractor-contenido.js`, y **CPR-001** documenta el mismo defecto vivo en
  `dominio/robots.js`.
- El residual de **SEC-09** (IP interna en el historial de git) **sigue pendiente**: purgar con
  `git filter-repo` **antes de publicar el repositorio**. Responsable: admin del repositorio.

### Hallazgos refutados en 2026-08-02 (no relitigar)

| Hallazgo propuesto | Motivo del descarte |
|---|---|
| Paginación profunda en `/api/historico` | `OFFSET` es O(min(offset, filas)) en Postgres; el coste dominante es idéntico con `pagina=1`. Reintentado y vuelto a descartar como **CPR-022** |
| `bootstrap.py` ejecuta SQL de `SCHEMA_SQL_PATH` | No cruza frontera de confianza: solo puede fijarla quien ya controla el `.env` |
| Frontend "confía en el shape del API" | El shape se valida por campo en el backend con `response_model` |
| Auto-deploy sin compuerta de tests | Desplegar exige write al repo = actor confiado. Reevaluado bajo el contexto v3 como **CPR-016** (INDETERMINADO) |
| `npm install` vs `npm ci` como vulnerabilidad | Con lockfile v3 presente y en sync, `npm install` resuelve el mismo árbol verificado por hash. Reintentado y vuelto a descartar dentro de **CPR-012** |

---

## ENTREGA A ETAPA 2

**Alcance recibido:** 15 VERIFICADOS (2 Medios, 9 Bajos, 4 Informativos), 2 INDETERMINADOS,
1 EXTERNO, 5 DESCARTADOS + 5 descartados heredados de 2026-08-02. Identificadores `CPR-001` a
`CPR-023`, **inmutables**.

**Orden de trabajo sugerido, por relación esfuerzo/beneficio y no solo por severidad:**

1. **CPR-001** (Media) — opción 1: guarda de comodines en `patronARegex`. Es el único hallazgo
   cuyo impacto toca uno de los cuatro errores declarados inaceptables por SECOM (boletín
   desactualizado a las 8:00) y se cierra con una guarda en una función pura ya cubierta por
   tests.
2. **Lote de una línea, riesgo casi nulo, sin decisión funcional:** CPR-009 (invertir el
   truncado), CPR-008 (guarda de rango en tres archivos), CPR-007 (corte por `Content-Length` en
   `fuente-rss.js`), CPR-003 (normalizar IPv6 v4-mapeada), CPR-010 (`ORDER BY` + campo
   `truncado`), CPR-014 (tres `request: Request`), CPR-005 (hashear el nombre), CPR-015
   (patrones `.env`), CPR-012 opción 1 (alinear la versión de Python).
3. **CPR-002** (Media) — opción 2 (`jti` + lista de revocados con fallo abierto). Es la de mayor
   diseño; su opción 1 **no debe aplicarse sin evaluar el requisito de las 8:00**.
4. **CPR-013, CPR-011, CPR-004, CPR-006** — requieren decisión o coordinación.

**Elevaciones al mandante (decisiones funcionales, no técnicas):**

- **CPR-005 opción 2**: cuánto tiempo se conserva la traza de `auditoria` es política de datos.
- **CPR-010 opción 3**: qué significa "supresión" en este sistema —borrar la fila o redactar el
  campo— afecta a la política de protección de datos.
- **CPR-011 opción 3**: cachear la carga pública colisiona con la promesa de efecto **inmediato**
  del retiro. Recomendación: **no** aplicarla.
- **CPR-002 opción 1**: acortar la ventana de sesión tensiona el requisito de disponibilidad a
  las 8:00 ante una caída del IAM.

**Elevaciones a terceros:**

- **DevOps / admin del repositorio**: los tres comandos `gh api` de CPR-016; la activación de TLS
  contra Postgres (CPR-006, con el equipo de BD); SEC-11 a SEC-14 del anexo B; y la purga del
  historial de git de SEC-09 **antes de publicar el repositorio**.
- **Equipo de COIPO_USUARIOS (IAM)**: CPR-018 (soporte de PKCE, `client_secret` obligatorio en
  `/oauth/token`, invalidación del código tras canje fallido) y el contrato de `role` en
  `/oauth/userinfo` que bloquea CPR-017.

**Advertencias para la etapa 2:**

1. **La fase CAZADOR no se ejecutó.** Los puntos ciegos están enumerados en el Anexo A y son
   accionables: los 17 módulos de `collector/src/dominio/` son superficie ReDoS del mismo tipo que
   CPR-001, que ya demostró ser real. **Esta auditoría no puede declararse completa.**
2. **No relitigar** ninguno de los 10 descartados sin evidencia nueva (principio 6). Cada uno
   tiene su motivo citado con `archivo:línea`.
3. **Los cuatro descartes por configuración de producción dependen de una declaración del
   mandante, no de una lectura del repositorio.** Si el `.env` cambia, esos cuatro candidatos
   vuelven a estar vivos. Conviene fijar los cinco valores confirmados en la documentación de
   despliegue para que la próxima auditoría no dependa de la memoria de nadie.
4. **`backend/tests/` falsifica la base con un intérprete parcial de expresiones SQLAlchemy**
   (`conftest.py`): una consulta nueva más compleja exige extenderlo, y ningún test de esa suite
   prueba comportamiento real de Postgres. No tratar el verde de `pytest` como evidencia de que
   una consulta se comporta igual en producción.
