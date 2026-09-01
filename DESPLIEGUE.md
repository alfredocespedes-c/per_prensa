# DESPLIEGUE.md — Pre-flight de la rama `fix/seguridad-2026-08-02`

> **Runbook para el operador con acceso al servidor.** Este análisis se produjo SIN acceso
> a la VM, `.env`, Docker ni la BD. Por FASE 0.5 y PROHIBIDO, el agente **no ejecuta el
> merge/deploy ni el rollback**: eso requiere acompañar el despliegue con ventana de reversión.
> Aquí está el pre-flight completo desde el repo y la secuencia exacta a ejecutar en el servidor.

---

## FASE 0 — Precondiciones

| # | Precondición | Estado |
|---|--------------|--------|
| 0.1 | Rama == revisada, sin commits posteriores al veredicto | ⚠️ **A confirmar por el operador.** La rama se auto-verificó por hallazgo (JUEZ FIRME) durante la remediación; **no consta una revisión independiente posterior**. 11 commits sobre `main@f184d77`. Los últimos (docs, fix de IP en test) no cambian el código de las correcciones. |
| 0.2 | Sin hallazgos en REINTENTAR abierto | ✅ 0 reintentos (REMEDIACION.md §1). |
| 0.3 | BLOQUEADOS aceptados como diferidos | ✅ Ninguno BLOQUEADO. Bloque B (SEC-10…14) diferido por decisión explícita del mandante → acción manual. |
| 0.4 | Orden de acciones manuales | Ver §Secuencia, abajo. |
| 0.5 | Ventana de reversión declarada | ⛔ **La declara el operador.** El agente no puede acompañar el despliegue. |

### Secuencia respecto al merge (FASE 0.4)
1. **ANTES del merge:** verificar paridad de config (FASE 1) — sobre todo `DATABASE_HOST` en `.env`. Capturar punto de retorno (FASE 2). Opcional pero recomendado: pre-crear el índice CONCURRENTLY (FASE 1.4).
2. **Merge = deploy.** Observar el pipeline (FASE 4).
3. **DESPUÉS de confirmar (FASE 6):** acciones manuales del Bloque B (independientes del deploy) y purga de la IP del historial git (independiente; antes de publicar el repo).
4. **Rotación de credenciales:** NO aplica (no hay secretos en código/historial).

---

## FASE 1 — Paridad de configuración (el punto crítico)

### 1.1 Variables de entorno — delta
| Lista | Resultado |
|-------|-----------|
| Nuevas que faltan | **Ninguna.** El diff no introduce ninguna lectura de env nueva. |
| Valor esperado cambió | **Ninguna en `.env`.** ⚠️ Pero el **default en código** de `DATABASE_HOST` cambió: `172.31.2.40` → `localhost` (SEC-09, `config.py:10`). |
| Sin uso | Ninguna eliminada. |

> ⛔ **BLOQUEANTE — verificar antes del merge:** si el `.env` del servidor **NO** define
> `DATABASE_HOST` (y dependía del default hardcodeado), el backend nuevo intentará conectar a
> `localhost` y **fallará silenciosamente la conexión a la BD**.
> **Evidencia de que probablemente ya está definido:** el collector usa
> `POSTGRES_ACTIVO = Boolean(process.env.DATABASE_HOST)` — el archivado a Postgres del stack v2
> solo funciona si `.env` define `DATABASE_HOST`. Aun así, **confírmalo explícitamente:**
> `grep -E '^DATABASE_HOST=' /opt/apps/<app>/.env` debe devolver un host real, no vacío.

### 1.2 Delta de despliegue
- `backend/Dockerfile`: **solo comentario** (IP → `<HOST_BD>`); el `CMD uvicorn … --workers 2` intacto.
- `docker-compose.dev.yml`: **solo comentario** (dev, no prod).
- **`docker-compose.yml` (prod), `nginx.conf`, `collector/Dockerfile`, `frontend/Dockerfile`: INTACTOS.**
- Conclusión: **el contenedor nuevo es intercambiable con el actual.** Sin cambios de puertos, volúmenes, red ni imagen base.

### 1.3 Dependencias
- **Cero cambios** en `package.json`/`package-lock.json`/`requirements.txt`. `fetch-seguro.js` usa `node:dns/promises` (built-in). Nada que descargar en el servidor.

### 1.4 Migración de BD
- **Delta único:** `CREATE INDEX IF NOT EXISTS idx_noticias_deteccion ON noticias (fecha_deteccion DESC)` (SEC-02). (La tabla `colecta_ejecuciones` ya está en `main`, no es parte de este delta.)
- Se aplica **idempotente al arranque** (backend `bootstrap.py` + collector, bajo advisory lock).
- **Compatible hacia atrás:** el código viejo no necesita el índice; si se hace rollback de código, el índice permanece sin efecto. **El rollback de código basta.**
- ⚠️ **Caveat operacional:** `CREATE INDEX` (no CONCURRENTLY) **bloquea escrituras** en `noticias` mientras se construye. Si la tabla es grande, el primer arranque del backend/collector puede bloquear brevemente las escrituras del collector.
  **Mitigación recomendada (pre-merge), ejecutar en la BD:**
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_noticias_deteccion ON noticias (fecha_deteccion DESC);
  ```
  Así el `IF NOT EXISTS` del arranque queda en no-op y no hay lock.

### 1.5 Conexión a la BD
- **Cambio:** `connect_args` suma `"options": "-c statement_timeout=15000"` (SEC-02). **`sslmode`/`gssencmode`/`connect_timeout` SIN CAMBIOS** → no hay cambio de cifrado/autenticación (no aplica el riesgo de "cambio de modo de cifrado que falla por config del servidor").
- **Validar contra la BD real antes del merge** (FASE 1.5): `statement_timeout` es un GUC de sesión settable por cualquier rol; riesgo bajo, pero confírmalo con una conexión de prueba desde el servidor con las credenciales reales.

### Salida de FASE 1 — acciones de config en el servidor
1. `.env`: **confirmar `DATABASE_HOST` definido** (bloqueante). Sin cambios de valores a aplicar. Sin variables nuevas.
2. (Recomendado) pre-crear el índice `CONCURRENTLY` en la BD.
3. Validar `statement_timeout` con una conexión de prueba real.

---

## FASE 2 — Punto de retorno (capturar en el servidor ANTES del merge)
| # | Ítem | Cómo | Quién |
|---|------|------|-------|
| 1 | Commit destino de rollback de código | **`f184d77`** (main actual) — ya registrado | ✅ agente |
| 2 | Imagen corriendo hoy (tag + digest) | `docker inspect --format '{{.Image}}' <cont>` / `docker images --digests` | operador |
| 3 | Copia fechada del `.env` | `cp /opt/apps/<app>/.env ~/env.bak.$(date +%F-%H%M)` | operador |
| 4 | Respaldo de BD (hay migración de índice) | `pg_dump` y **verificar que el archivo existe y pesa** | operador |
| 5 | Estado de contenedores | `docker compose ps` (guardar salida) | operador |
| 6 | Comando de rollback validado | Ver abajo | operador |

**Comando de rollback (código) — el merge dispara deploy, así que revertir main re-despliega el anterior:**
```bash
# Opción segura (conserva historia): revertir el merge y empujar.
git checkout main && git pull
git revert -m 1 <SHA_DEL_MERGE>
git push origin main            # re-dispara el pipeline con el código f184d77
```
Si el pipeline no reconstruye por sí solo, además: `docker compose up -d --force-recreate` con la imagen previa (digest del ítem 2).

---

## FASE 3 — Criterios de reversión (fijados ahora)
- **Revertir de inmediato si:** el contenedor `backend`/`app` no levanta; `/api/noticias` o `/health` no responde; errores nuevos en logs de arranque; la app no responde en **10 min**.
- **Ventana de observación:** **60 min** (cubre un tick del collector en `:00` + servir la ventana).
- **Criterio de éxito (declarado):** `app` sirve la SPA; `GET /api/noticias` devuelve `{secciones, noticias}`; `GET /health` = `{"status":"ok","db":"ok"}`; el collector loguea una corrida; sin errores nuevos.
- **NO es criterio de reversión** (cambios intencionales documentados en REMEDIACION.md §4): `/api/historico?desde=` recortado a 400 días (SEC-02); manejo de redirecciones/DNS del collector (SEC-03); `/health` en error devuelve `{"db":"error"}` sin detalle (SEC-07).

---

## FASE 4–6 — Ejecución y verificación (checklist del operador)
El agente no ejecuta estas fases. Checklist a seguir con la ventana abierta:

**FASE 4 — Deploy**
- [ ] Aplicadas las acciones de config de FASE 1 (DATABASE_HOST confirmado; índice CONCURRENTLY opcional).
- [ ] Una sola app en esta ventana.
- [ ] Merge de `fix/seguridad-2026-08-02` → `main`. Observar el pipeline: **construyó → publicó → recreó el contenedor** (no solo "terminó").

**FASE 5 — Verificación en prod (con evidencia: petición/respuesta)**
- [ ] `GET /api/noticias` → 200 + `{secciones,noticias}` (comparar con baseline).
- [ ] `GET /api/historico?pagina=1&tamanoPagina=50` → 200; `?tamanoPagina=999` → 422 (contrato intacto).
- [ ] `GET /health` → `{"status":"ok","db":"ok"}`.
- [ ] **ATACANTE contra prod:** `GET /health` con BD forzada a fallar **no** filtra host/usuario (SEC-07); `GET /api/historico?desde=1900-01-01T00:00:00Z` responde acotado y rápido, sin agotar el pool (SEC-02); una corrida del collector completa en `:00` (SEC-01/03/06).
- [ ] Config efectiva cargada: `docker compose exec backend printenv DATABASE_HOST` = host real (no `localhost`).
- [ ] Perímetro (fuera de tu alcance): TLS y cabeceras del reverse proxy — registrar estado observable (ver §requerimiento perimetral).

**FASE 6 — Decisión** (se presume REVERTIDO salvo que a+b+c se cumplan): CONFIRMADO / REVERTIDO / PARCIAL.

---

## FASE 7 — Cierre (tras CONFIRMADO)
1. Actualizar SEGURIDAD.md: por hallazgo, **CERRADO EN PRODUCCIÓN** con fecha, commit desplegado y evidencia del ATACANTE en prod. **No cerrar sin esa evidencia.**
2. Ejecutar acciones manuales del Bloque B (SEC-10…14) y la purga del historial git (SEC-09) en el orden de §Secuencia; confirmar cada una.
3. **Requerimiento al equipo perimetral:** rate-limiting y cabeceras de seguridad (CSP/HSTS/X-Frame/etc.) en el reverse proxy externo; confirmar cifrado TLS hacia la BD compartida (SEC-04 histórico, fuera de este repo). Un hallazgo cerrado en código pero abierto en el perímetro **no está cerrado**.
4. Avisar a SECOM si algún flujo cambió de comportamiento (ninguno visible para el usuario final en este lote).
5. Registrar en REMEDIACION.md: ventana usada, incidencias, si hubo rollback, ajustes para el próximo despliegue.

---

## Resumen del pre-flight
- **Riesgo de config:** bajo, con **1 bloqueante a verificar** (`DATABASE_HOST` en `.env`).
- **Deploy delta:** nulo funcionalmente (solo comentarios; prod-compose/nginx intactos).
- **Migración:** 1 índice aditivo, compatible hacia atrás; pre-crear CONCURRENTLY si `noticias` es grande.
- **Rollback:** código a `f184d77`; el índice no estorba al código viejo.
- **Bloqueo del agente:** sin acceso a servidor/`.env`/BD/Docker ni capacidad de revertir → **la ejecución (FASE 4+) es del operador**, dentro de su ventana.
