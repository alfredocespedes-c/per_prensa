# REMEDIACION.md — Informe de remediación de seguridad

**Rama:** `fix/seguridad-2026-08-02` (sin merge, sin push a `main` — lista para revisión).
**Base:** commit `f184d77`. **Fecha:** 2026-08-02.
**Método:** ciclo por hallazgo REMEDIADOR→ATACANTE→REGRESOR→JUEZ, un commit atómico por
hallazgo. Ver detalle de cada hallazgo en [SEGURIDAD.md](SEGURIDAD.md).

---

## 1. Resumen

De 14 hallazgos: **1 ya corregido**, **8 corregidos** (Bloque A), **5 fuera de alcance**
(Bloque B, desplazados a acción manual por no estar autorizado tocar despliegue/infra).

| Resultado | Hallazgos |
|-----------|-----------|
| YA CORREGIDO | SEC-01 (ReDoS; corregido en sesión previa, verificado vigente) |
| CORREGIDO | SEC-02, SEC-03, SEC-04, SEC-05, SEC-06 (parcial), SEC-07, SEC-08, SEC-09 |
| BLOQUEADO | — (ninguno) |
| REVERTIDO POR RIESGO | — (ninguno) |
| FUERA DE ALCANCE (manual) | SEC-10, SEC-11, SEC-12, SEC-13, SEC-14 |

**Commits** (`git log main..HEAD`): `312a488` SEC-07 · `49caaab` SEC-09 · `a7fa92a` SEC-08 ·
`24e1d92` SEC-05 · `d7babd2` SEC-04 · `047227a` SEC-06 · `7a518fb` SEC-02 · `3839373` SEC-03.

**Ningún hallazgo requirió reintento**: los 8 pasaron a FIRME en el primer intento del JUEZ
(ATACANTE sin bypass, REGRESOR sin regresión o solo cambios intencionales).

---

## 2. Reintentos y precisión del diagnóstico original

- **Reintentos:** 0. Ningún `git reset` fue necesario.
- **Precisión del diagnóstico (SEGURIDAD.md):** alta. Ajustes de detalle durante la ejecución:
  - **SEC-08:** el diagnóstico apuntaba a una sola `<img>`; el ATACANTE encontró la misma
    pauta en el segundo `<img>` (favicon de Google). Se cubrieron ambas (mismo commit).
  - **SEC-03:** el diagnóstico listaba `fuente-sitemap-news.js` como punto SSRF. En ejecución
    se determinó que su fetch usa una URL de **config curada** (`MEDIOS_SITEMAP`, no atacante);
    la superficie no confiable (Google-resuelto, `<loc>`, artículos) se descarga vía el
    **extractor**, que sí se endureció. El fetch del sitemap se dejó sin envolver a propósito.
  - **SEC-06:** confirmado que la guarda `MAX_BYTES_SITEMAP` existente era inefectiva (medía
    `xml.length` **después** de bufferizar). El fix añade el corte por `Content-Length` antes.
  - Las líneas de evidencia de `extractor-contenido.js` se desplazaron respecto a SEGURIDAD.md
    por el fix previo de SEC-01 (p. ej. el `fetch` pasó de :144 a :151); no altera los hallazgos.

---

## 3. Acciones manuales pendientes

### 3.1 Bloque B — requiere autorización para tocar despliegue/infra (no ejecutado)
| ID | Acción | Archivo | Responsable sugerido |
|----|--------|---------|----------------------|
| ~~SEC-10~~ | **HECHO (2026-08-04):** reusable y actions fijados a SHA, `permissions:` mínimos, `concurrency`, timeouts y deploy condicionado a CI verde — ver `.github/workflows/ci.yml` (reemplaza a `deploy-prod.yml`) | `.github/workflows/ci.yml` | — |
| SEC-11 | `USER` no-root en los 3 Dockerfiles; `cap_drop`/`read_only`/`no-new-privileges`/`mem_limit` en compose | `*/Dockerfile`, `docker-compose.yml` | DevOps |
| SEC-12 | Cabeceras de seguridad (CSP, X-CTO, X-Frame, Referrer-Policy, `server_tokens off`) | `frontend/nginx.conf` | DevOps |
| SEC-13 | Bindear `5432` a loopback en dev; quitar credenciales por defecto `coipo/coipo` | `docker-compose.dev.yml` | Desarrollo |
| SEC-14 | **Parte CI HECHA (2026-08-04):** `npm audit`/`audit-ci`/`pip-audit` como compuerta en `ci.yml` + dependabot (npm/pip/actions/docker). **Pendiente:** supercronic por SHA-256, imágenes base por digest, `npm ci` en Dockerfiles, lockfile Python | Dockerfiles, `requirements.txt` | DevOps |

### 3.2 Fuera del repositorio
- **SEC-09 (residual):** la IP interna sigue en el **historial git**. Purga con `git filter-repo`
  **antes de hacer público el repo** (reescribe historia; coordinar). Responsable: Admin del repo.
- **Reverse proxy externo del servidor:** rate-limiting y cabeceras podrían configurarse también
  ahí (complementa SEC-02/SEC-12). Responsable: DevOps. Fuera de este repo (`COIPO_DOCUMENTO`).
- **Rotación de credenciales:** **NO aplica** — no hay secretos en el código ni en el historial
  (solo la IP interna y `.env.example` vacío).

---

## 4. Cambios de comportamiento a validar funcionalmente antes de desplegar

Estos cambios son **intencionales** (no regresiones), pero no se pudieron validar dinámicamente
en el entorno de remediación (sin backend/BD/contenedores) y deben confirmarse en la VM:

1. **SEC-03 (el de mayor riesgo).** El extractor pasó de `redirect:'follow'` a redirección
   **manual revalidada** + resolución **DNS** por host. Validar contra medios reales que:
   (a) los artículos que redirigen (http→https, canonicalización www) se sigan descargando;
   (b) la latencia extra del DNS no degrade la corrida; (c) no aumenten los fallos de
   extracción. Si algo se rompe, el efecto es fail-open (esa noticia queda sin enriquecer),
   no una caída — pero conviene confirmarlo con una corrida real.
2. **SEC-02.** `GET /api/historico?desde=<>400 días>` ahora **recorta** el rango a 400 días.
   `statement_timeout=15000` aborta consultas >15 s. Validar que las consultas legítimas del
   histórico responden igual (el frontend usa el default de 30 días → sin cambio esperado).
3. **SEC-07.** `/health` en error devuelve `{"db":"error"}` en vez del detalle. Validar que
   ninguna alerta externa dependiera del texto anterior.
4. **SEC-06.** Descargas con `Content-Length` > 10 MB (extractor/enriquecedor) o > 5 MB
   (sitemap) se saltan. Verificar que ningún medio legítimo supere esos topes.

---

## 5. Decisiones bloqueadas

Ninguna. No hubo hallazgos cuyo cierre exigiera una decisión de negocio/autorización fuera del
repositorio dentro del Bloque A. El Bloque B no se bloqueó: se excluyó por decisión explícita
del mandante (acción manual).

---

## 6. Pasada de integración final

Con los 8 commits aplicados: `cd collector && npm test` → **107/107 en verde (12 archivos)**.
No hay conflicto entre correcciones. Árbol de trabajo limpio.

---

## 7. Limitaciones de la verificación (qué no se pudo comprobar y por qué)

- **Sin backend/BD/Docker/VM en el entorno de remediación** (no hay Python ni Docker). Por tanto:
  - **SEC-02 y SEC-07** (backend) se verificaron **solo estáticamente** (lectura). No se ejecutó
    ninguna petición real contra `/api/historico` ni `/health`, ni se corrió el índice/migración.
  - El **set de humo de endpoints** no es ejecutable aquí; el REGRESOR quedó **ciego a nivel
    dinámico** para todo lo de backend/infra (declarado desde FASE 0.4).
- **Frontend sin runner de tests** (no hay script `test` ni `*.test.*` en `frontend/`). SEC-05 y
  SEC-08 se verificaron con un **script node standalone** (SEC-05) y por inspección (SEC-08),
  no con una suite persistente.
- **SEC-03 residual — DNS-rebinding:** un host que resuelva a IP pública en la validación y a IP
  privada al conectar no queda cerrado sin fijar la IP resuelta en la conexión (no implementado).
- **SEC-06 residual:** el corte por `Content-Length` no cubre respuestas sin ese header ni
  `Transfer-Encoding: chunked`; el cierre total exige lectura por streaming (no implementado).
- **SEC-04 residual:** las noticias ya almacenadas **antes** del fix no se re-validan (la ventana
  rota; no hay evidencia de inyección previa). Saneo del `href` en el frontend recomendado como
  complemento (no en alcance).
- Los tests de `fetchSeguro` son **herméticos** (usan IP literales para no tocar la red): prueban
  la lógica del guard, no el comportamiento contra hosts/DNS reales.

---

## 8. Próximos pasos sugeridos

1. Revisar la rama `fix/seguridad-2026-08-02` (8 commits atómicos).
2. Ejecutar en la VM el set de humo real de `/api/historico`, `/api/noticias`, `/health` y una
   corrida del collector, validando los cambios de comportamiento de la §4.
3. Decidir sobre el Bloque B (§3.1) y la purga del historial git (§3.2).
4. Merge a `main` tras validación (dispara el deploy automático).
