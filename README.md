# COIPO_PRENSA — Monitor de Prensa CONAF

Aplicación web que muestra las últimas noticias de medios chilenos donde se menciona

**CONAF** o **Corporación Nacional Forestal**, con el formato del boletín de prensa
diario que la institución recibía de un servicio pagado de clipping. La v2 corre
**autoalojada** con Docker Compose: nginx (frontend React), API FastAPI, collector
Node con cron interno y una base Postgres para el histórico.

> Proyecto de la Unidad de Información y Análisis de CONAF, pensado para ser
> **reutilizado por otras instituciones públicas**: un fork con otros conceptos de
> búsqueda y otra lista de medios produce el mismo boletín para cualquier organismo.

## Cómo funciona

```
      cada hora (supercronic dentro del contenedor collector)
┌──────────────────────────────────────────────────────────┐
│ collector (Node), tres fuentes:                          │
│   a) feeds RSS de los medios curados (links directos)    │
│   b) Google News (red de seguridad de cobertura)         │
│   c) sitemaps de noticias (medios sin RSS)               │
│ → detecta menciones → dedup → ventana móvil → análisis   │
│ → escribe noticias.json (+ histórico) y archiva en       │
│   Postgres (upsert-only, fail-open)                      │
└──────────────────────────────────────────────────────────┘
                          ↓
      backend FastAPI: /api/noticias · /api/historico · /health
                          ↓
      nginx: React estático (jerarquía concepto → tipo de medio, resaltado, dashboard)
```

## Dos superficies

La portada es **pública**; el resto exige sesión. Y lo que cambia no es la presentación
sino **el dato que sale del servidor** (`backend/app/servicios/mapeo.py`):

| Elemento | Portada pública | Interno (tras COIPO IAM) |
|---|---|---|
| Titular, medio, fecha, enlace | Sí | Sí |
| Autor | No | Sí |
| Extracto | No | Sí, ≤500 caracteres |
| Tono, entidades, regiones, eventos | No | Sí |

**Imágenes: ninguna, en ninguna de las dos superficies.** El sistema no extrae, no almacena
y no muestra imágenes de prensa, por decisión del departamento legal.

El sistema **nunca almacena ni muestra más de lo que el medio expone deliberadamente**:
consulta `robots.txt` antes de cada petición, el cuerpo del artículo se procesa en memoria
pero no se persiste, el texto se purga a los 180 días y la fila a los 400, y cualquiera
puede pedir el retiro de una nota o de un medio completo desde `/#/retiro`. **No hay
exportación masiva de datos.**

- Si una corrida del collector falla, la API sigue sirviendo el último estado bueno:
  la página puede quedar desactualizada, pero **nunca caída ni en blanco**.
- El detalle de despliegue está en [DESPLIEGUE.md](DESPLIEGUE.md); el informe de
  seguridad en [SEGURIDAD.md](SEGURIDAD.md) y su estado en [REMEDIACION.md](REMEDIACION.md).

## CI y despliegue

[`.github/workflows/ci.yml`](.github/workflows/ci.yml): cada push y PR corre en
paralelo los tests del collector (vitest + coverage con umbral), del frontend
(oxlint + vitest + build) y del backend (pytest), la auditoría de dependencias
(`npm audit`/`audit-ci`/`pip-audit`) y el build de las tres imágenes Docker. El
**deploy a producción solo ocurre en push a `main` con todo en verde** (workflow
reusable de infra, fijado a SHA inmutable). Dependabot
([`.github/dependabot.yml`](.github/dependabot.yml)) mantiene dependencias y pins.

## Estructura

- [`collector/`](collector/) — recolector Node (≥22) con **arquitectura hexagonal**:
  - `src/dominio/` — reglas puras y testeadas: detección de menciones (insensible a
    mayúsculas/tildes, con límites de palabra: "CONAFE" no es "CONAF"), deduplicación,
    ventana móvil, secciones, enriquecimiento (categorías, sentimiento, entidades,
    geografía, riesgo, eventos, histórico).
  - `src/puertos/` — contratos (fuentes, repositorio de estado, extractor, archivador).
  - `src/adaptadores/` — RSS por medio, Google News (resolución de enlaces), sitemaps,
    extractor de contenido, JSON en disco y archivador Postgres.
  - `src/config/` — **la "interfaz de administración"**: conceptos y medios se editan aquí.
- [`backend/`](backend/) — API FastAPI de solo lectura sobre Postgres (`/api/noticias`,
  `/api/historico` paginado, `/health`). Tests en `backend/tests/`.
- [`frontend/`](frontend/) — React + Vite: portada jerárquica (concepto → tipo de medio)
  con resaltado, más dashboard, búsqueda, mapa e histórico.
- [`db/schema.sql`](db/schema.sql) — fuente única de verdad del DDL.
- [`docs/REQUISITOS.md`](docs/REQUISITOS.md) — requisitos y alcance (fuente de verdad).
- [`docs/MEDIOS.md`](docs/MEDIOS.md) — registro de verificación de cada medio.

## Administración (sin interfaz: se edita el código)

**Agregar o quitar un concepto de búsqueda** — `collector/src/config/conceptos.js`:

```js
export const CONCEPTOS = ['CONAF', 'Corporación Nacional Forestal']
```

**Agregar o quitar un medio** — `collector/src/config/medios.js` (ver el procedimiento
de verificación en [docs/MEDIOS.md](docs/MEDIOS.md)):

```js
{ id: 'la-tercera', nombre: 'La Tercera', tipo: 'escrita', feedUrl: 'https://...' }
```

`tipo` es uno de los ids de `collector/src/dominio/secciones.js` (`escrita`,
`regional`, `radio`, `digital`, `tv`, `otros`, `internacional`).
`collector/test/config-medios.test.js` valida la integridad de la lista (ids únicos,
tipos válidos, URLs bien formadas): correr `npm test` antes de pushear; el CI lo
exige de todos modos.

## Desarrollo local

```bash
# collector: tests (con coverage) y corrida real (genera datos/noticias.json)
cd collector && npm ci && npm test && npm run test:coverage && npm start

# frontend: lint, tests y dev server (proxy /api → localhost:8000)
cd frontend && npm ci && npm run lint && npm test && npm run dev

# backend: tests (sin Postgres: la BD se falsifica en los tests)
cd backend && python3 -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest

# stack completo
cp .env.example .env   # completar credenciales
docker compose up -d --build
```

## Limitaciones conocidas (documentadas en REQUISITOS.md)

- **Google News se consulta bajo exención declarada.** `news.google.com` declara
  `Disallow: /` con una lista blanca que no incluye `/rss/search`. Como `robots.txt` es un
  convenio (RFC 9309) y no una norma, y el uso es el de menor exposición posible —titular
  y enlace a la nota original—, el responsable del proyecto resolvió eximir ese origen:
  `ROBOTS_EXENTOS` en `collector/src/config/parametros.js`, con el fundamento por escrito.
  Los 63 medios chilenos siguen gobernados por `robots.txt` sin cambios; la exención es
  por origen y está probada para que no se derrame.
- **Radio y TV habladas quedan fuera**: requieren transcripción (pagada).
- **Detección sobre lo que entrega cada fuente.** El cuerpo del artículo se descarga y se
  analiza en memoria, pero **no se persiste**: lo único que queda almacenado es el
  extracto de 500 caracteres centrado en la mención.
- **Sin exportación masiva** (no hay CSV ni equivalente).
- **Latencia de una hora** entre corridas del cron interno del collector.

## Licencia

[MIT](LICENSE). Los contenidos de los medios pertenecen a sus dueños. La salvedad sobre
logos de terceros quedó sin objeto: el sistema no usa ninguna imagen de prensa.

La app muestra **titular, fecha y enlace a la nota original** en la portada pública, y
añade un **extracto de hasta 500 caracteres** solo tras iniciar sesión. La portada pública
**no muestra extracto**: el recorte lo hace el servidor, no el navegador (ver
`backend/app/servicios/mapeo.py` y la tabla de superficies en `CLAUDE.md`).
