# REMEDIACION.work.md — Estado de trabajo (rama fix/seguridad-2026-08-02)

## FASE 0 — Línea base (2026-08-02)

**Árbol de trabajo:** limpio al iniciar (el mandante commiteó el trabajo previo).
HEAD = `f184d77 pre seguridad`. Rama creada: `fix/seguridad-2026-08-02`.

**Herramientas disponibles en este entorno:**
- Node v24.11.0 / npm 11.6.1 → **collector y frontend ejecutables**.
- Python: **NO disponible**. Docker: **NO disponible**. Sin `.env`, sin Postgres, sin VM.

### ⚠️ Limitación de la línea base (FASE 0.4) — EL REGRESOR ESTÁ PARCIALMENTE CIEGO
No se puede levantar el backend (FastAPI), ni los contenedores, ni golpear los endpoints
HTTP. El **único set de humo ejecutable** es la suite de tests del collector.
Consecuencia: los hallazgos de **backend (SEC-02, SEC-07)** e **infra (SEC-10…SEC-14)** solo
admiten **verificación estática** (lectura de código); el REGRESOR no puede confirmar
dinámicamente que no se rompió una respuesta. Esto se advertirá en la salida final.

### Inventario de endpoints (autenticación actual: NINGUNA en los tres)
| Método | Ruta | Auth | Respuesta (forma) |
|---|---|---|---|
| GET | `/api/noticias` | pública | `{generadoEn, tamanoVentana, secciones[], noticias[]}` |
| GET | `/api/historico?desde&hasta&medioId&seccionId&pagina&tamanoPagina` | pública | `{pagina, tamanoPagina, total, resultados[]}` |
| GET | `/health` | pública | `{status, db, ultimaColecta, minutosDesdeUltimaColecta}` |

El collector no expone HTTP (proceso cron). El frontend es SPA estática.

### Set de humo
- **Ejecutable (baseline):** `cd collector && npm test` → **97/97 en verde** (11 archivos).
- **NO ejecutable aquí** (requiere backend + Postgres + env): peticiones a `/api/noticias`,
  `/api/historico` (caso válido: `?pagina=1&tamanoPagina=50`; caso inválido: `?tamanoPagina=999`
  → 422 por `le=200`), `/health`. Documentado como comportamiento esperado, no verificado en vivo.
- Frontend: sin suite de tests presente (vitest está como dependencia, pero no hay `*.test.*` en `frontend/`).

### Dependencias exactas (baseline)
- backend/requirements.txt: `fastapi>=0.115,<1.0`, `uvicorn[standard]>=0.32,<1.0`,
  `sqlalchemy>=2.0,<3.0`, `psycopg2-binary>=2.9,<3.0`, `python-dotenv>=1.0,<2.0` (sin lockfile).
- collector: `pg ^8.13.1`, `rss-parser ^3.13.0` (+ lockfile presente).
- frontend: React 19.2.7, Vite 8.1.1, etc. (+ lockfile presente).

---

## FASE 1 — Verificación de hallazgos y plan

### Estado de cada hallazgo vs. código actual
| ID | Estado | Evidencia (línea actual) |
|---|---|---|
| SEC-01 | **YA CORREGIDO** | `extractor-contenido.js:61-62` usa recolección de `<p>` acotada; el regex con backtracking ya no existe. Verificado: input patológico 0 ms, 97/97 tests. |
| SEC-02 | VIGENTE | `historico.py:37` `rango_desde = desde or (...)`; sin índice en `fecha_deteccion`; sin `statement_timeout`. |
| SEC-03 | VIGENTE | `extractor-contenido.js:151` fetch con `redirect:'follow'`, sin allowlist de host. |
| SEC-04 | VIGENTE | `noticia.js:12` `new URL(crudo)` acepta `javascript:`; `:46` emite `url` sin allowlist. |
| SEC-05 | VIGENTE | `csv.js:26` `escaparCampo` no neutraliza `= + - @`. |
| SEC-06 | VIGENTE | `extractor-contenido.js:161` `await respuesta.text()` sin tope de tamaño. |
| SEC-07 | VIGENTE | `salud.py:22` interpola la excepción cruda de la BD. |
| SEC-08 | VIGENTE | `NoticiaItem.jsx:157` `img src` sin `referrerpolicy`. |
| SEC-09 | VIGENTE | `config.py:10` default `172.31.x.x`; IP replicada en docs. |
| SEC-10 | VIGENTE | `deploy-prod.yml:9` reusable `@main`. **Workflow de despliegue → requiere autorización explícita (PROHIBIDO).** |
| SEC-11 | VIGENTE | Dockerfiles sin `USER`; `docker-compose.yml` sin límites. **Config de despliegue → requiere autorización.** |
| SEC-12 | VIGENTE | `nginx.conf` sin cabeceras. **Config de servidor → requiere autorización.** |
| SEC-13 | VIGENTE | `docker-compose.dev.yml` publica 5432 + `coipo/coipo`. **Config de despliegue → requiere autorización.** |
| SEC-14 | VIGENTE | supercronic SHA1, imágenes sin digest, `npm install`. **Toca Dockerfiles → requiere autorización.** |

### Fuera de alcance del repo (acciones manuales, al informe)
- **SEC-09 (parcial):** purga del historial git de la IP (`git filter-repo`) — reescribe historia.
- **SEC-10 (parcial):** los pasos internos del reusable externo `Sud-Austral/infra-docker-base` son opacos.
- Rate-limiting / cabeceras del **reverse proxy externo** del servidor (infra, no en este repo).
- **Rotación de credenciales:** NO aplica — no hay secretos en el código (verificado en la auditoría).

### Plan de ejecución (orden: primero lo inocuo, después lo que valida entrada)

**Bloque A — En alcance, ejecutable/verificable aquí (propongo remediar ya):**

| # | ID | Opción | Archivos | Cambio de comportamiento | Testeable aquí |
|---|----|--------|----------|--------------------------|----------------|
| 1 | SEC-07 | 1 (texto fijo + log server-side) | `routers/salud.py` | `/health` en error devuelve `db:"error"` en vez de la excepción | estático |
| 2 | SEC-09 | 1 (quitar IP de default y docs) | `config.py`, `.env.example`, `fastapi-postgresql-conexion.md`, `DOCKER.md`, comentarios | ninguno (el default nunca se usa en prod) | estático |
| 3 | SEC-08 | 1 (`referrerpolicy="no-referrer"`) | `NoticiaItem.jsx` | ninguno funcional | estático |
| 4 | SEC-05 | 1 (neutralizar `= + - @` TAB CR) | `csv.js` (+ test nuevo) | celdas CSV que empiezan por esos chars llevan `'` | **sí (test nuevo)** |
| 5 | SEC-04 | 1 (allowlist http/https en el dominio) | `noticia.js` (+ casos en `noticia.test.js`) | noticias con URL no-http(s) se descartan | **sí (test)** |
| 6 | SEC-06 | 1 (rechazo por `Content-Length`) — **parcial** | `extractor-contenido.js`, `enriquecedor-imagenes.js`, `fuente-sitemap-news.js` | descargas con `Content-Length` > tope se saltan | parcial (unit del guard) |
| 7 | SEC-02 | 1+índice (statement_timeout + cota de rango + índice `fecha_deteccion`; **se conserva `count()`** para no romper el contrato `total`) | `session.py`, `historico.py`, `schema.sql` | rangos > N días se acotan; consultas > timeout abortan | estático |
| 8 | SEC-03 | 2 (allowlist esquema + blocklist IP privada/link-local + `redirect:'manual'` revalidado) | `extractor-contenido.js`, `enriquecedor-imagenes.js`, `fuente-sitemap-news.js` (+ test del guard) | URLs a IP interna/esquema no-http se rechazan; redirecciones se siguen manualmente | parcial (unit del guard; redirect no testeable en vivo) |

**Bloque B — Requiere AUTORIZACIÓN EXPLÍCITA (PROHIBIDO tocar sin permiso):**
SEC-10 (workflow `deploy-prod.yml`), SEC-11 (Dockerfiles/compose), SEC-12 (`nginx.conf`),
SEC-13 (`docker-compose.dev.yml`), SEC-14 (integridad de artefactos en Dockerfiles).
Todos de severidad Baja. No se tocan hasta autorización.

### Pre-mortem adversarial (resumen por hallazgo del Bloque A)

- **SEC-04** (el más seguro): ATACANTE — el `url` fluye desde el dominio (fuente única) al
  backend y al `href`; corregir en `canonicalizarUrl` cubre toda la cadena; `imagen` ya tiene
  su propio allowlist. REGRESOR — ninguna noticia legítima tiene URL no-http(s) → cero rechazos
  falsos. **Sólido.**
- **SEC-05**: ATACANTE — todos los campos pasan por `escaparCampo` → sin desvío; variante
  " =..." con espacio inicial no es fórmula en Excel. REGRESOR — cambio cosmético (prefijo `'`)
  en celdas atípicas. **Sólido.**
- **SEC-07**: ATACANTE — el resto de la app usa el 500 genérico de FastAPI (sin `debug`); este
  era el único punto que filtraba. REGRESOR — nada consume el cuerpo de `/health` (el frontend
  no lo llama); cambio intencional. **Sólido (verificación estática).**
- **SEC-09**: REGRESOR — el default `DATABASE_HOST` nunca se usa en prod/dev (siempre viene de
  `.env`), así que quitarlo es inerte. Residual: la IP sigue en el historial git (manual).
- **SEC-02**: ATACANTE — con índice + cota de rango + `statement_timeout`, la consulta queda
  acotada; `/api/noticias` ya está acotado por `.limit()`. REGRESOR — el frontend
  (`historico-api.js`) solo manda `pagina`/`tamanoPagina` → usa el default de 30 días → no
  afectado. Se conserva `count()` para no cambiar `total`. **Riesgo bajo, pero sin test en vivo.**
- **SEC-06**: ATACANTE — un servidor que **omite** `Content-Length` (o usa chunked) evade el
  tope → cobertura **parcial** (declarado). Cierre total exigiría streaming (opción 2). REGRESOR
  — páginas legítimas con `Content-Length` normal no se afectan.
- **SEC-03** (el más riesgoso): ATACANTE — el guard de host cierra el acceso directo, pero
  **DNS-rebinding** (resolver a IP pública y luego privada) queda como residual salvo que se
  fije la IP resuelta; se documentará. REGRESOR — `redirect:'manual'` **cambia el manejo de
  redirecciones**; hay medios legítimos que redirigen (http→https, acortadores) → hay que
  seguirlas manualmente y revalidar, con riesgo de romper fetches legítimos que **no puedo
  probar en vivo**. Es el hallazgo con mayor riesgo de regresión no observable aquí.

### Recomendación de secuencia
Ejecutar Bloque A en el orden 1→8. Los ítems 1–5 son de alta certeza y bajo riesgo. El 6
(SEC-06) es parcial por diseño. El 7 (SEC-02) es sólido pero solo verificable estáticamente.
El **8 (SEC-03) es el de mayor riesgo de regresión no observable** — sugiero tratarlo al final
y, si el REGRESOR no puede validar el manejo de redirecciones, marcarlo como cambio pendiente
de validación funcional en la VM antes de desplegar.

---

## FASE 2 — Bitácora del ciclo por hallazgo
_(pendiente de aprobación del plan)_
