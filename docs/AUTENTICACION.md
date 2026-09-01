# Autenticación y administración de conceptos

> **DESACTUALIZADO EN UN PUNTO CLAVE (corregido abajo).** Este documento decía que *toda*
> la aplicación queda detrás del login. Ya no es así: la **portada** (`/#/`, `/#/publica`)
> y el **formulario de retiro** (`/#/retiro`) son públicos, igual que `GET /api/noticias`
> —que devuelve a los anónimos una carga útil reducida, sin extracto ni análisis— y
> `POST /api/retiros`. Ver la tabla de superficies en `CLAUDE.md` (decisión 6) y
> `backend/app/servicios/mapeo.py`.

Las vistas internas quedan detrás del login de **COIPO IAM** (`https://iam.conaf.cl`,
código en el repo `COIPO_USUARIOS`). Hay dos tipos de usuario:

| Rol | Puede |
|---|---|
| `general` | Leer el boletín completo (todas las vistas, con extracto y análisis) y ver la lista de conceptos. **No hay descarga masiva: la exportación CSV se eliminó.** |
| `admin` | Todo lo anterior **y** crear, editar y quitar conceptos de búsqueda y exclusión |

`general` no se asigna: es el rol que el IAM devuelve por defecto a quien **no tiene
asignación** en esta aplicación (`oauth_service.py`). `admin` sí se asigna a mano.

> **Decisión pendiente de confirmar con SECOM.** `PERMITIR_SIN_ASIGNACION=true` (el
> valor por defecto) significa que **cualquier funcionario con cuenta en COIPO IAM
> puede leer el boletín**, tenga o no asignación en esta app. Con `false`, solo entran
> los usuarios asignados explícitamente y el resto ve "no tienes acceso asignado".

## Cómo funciona (patrón BFF)

```
Navegador                    Backend COIPO_PRENSA              COIPO IAM
   │  GET /  ─────────────────────►│ (nginx sirve la SPA)
   │  GET /api/me ────────────────►│  401 (sin sesión)
   │  ◄── la Puerta redirige ──────┤
   │  GET /api/auth/login ────────►│ genera state, cookie firmada
   │  ◄──────────── 303 ───────────┤
   ├──────────────────────────────────────────────────────────►│ formulario de login
   │  usuario + contraseña ────────────────────────────────────►│
   │  ◄────────── 303 /api/auth/callback?code=…&state=… ────────┤
   │  ─────────────────────────────►│ valida state
   │                                │ POST /oauth/token ───────►│  (con CLIENT_SECRET)
   │                                │ GET  /oauth/userinfo ────►│
   │                                │ verifica app_id, lee rol
   │                                │ DESCARTA el JWT del IAM
   │  ◄── 303 / + cookie httpOnly ──┤
```

**El JWT del IAM nunca llega al navegador.** Lo único que sale es una cookie
`coipo_prensa_sesion`, `HttpOnly`, firmada con `SESSION_SECRET`. El navegador no puede
leerla ni modificarla, así que no se puede falsificar el rol desde el cliente.

### Por qué la sesión dura tanto

`SESION_INACTIVIDAD_SEGUNDOS` son 7 días deslizantes, con un tope absoluto de 30 días
más un jitter de hasta 3 días. No es comodidad: es el requisito de que **la página esté
arriba a las 8:00**.

El IAM se consulta en **un solo punto**: `GET /api/auth/callback`. Después la sesión es
propia y `obtener_sesion` solo verifica un HMAC local — no consulta al IAM ni a
Postgres. Con 7 días deslizantes, quien usó la app en la última semana entra **aunque
el IAM esté caído**. Con un TTL de 8-12 horas habría que pasar por el IAM casi todas
las mañanas, y una caída del IAM a las 07:50 dejaría a SECOM sin boletín.

El jitter evita un fallo correlacionado: sin él, todas las sesiones creadas el día del
despliegue vencerían el mismo día.

**Riesgo residual, sin mitigación posible:** el primer login de un usuario nuevo y el
re-login tras el tope absoluto sí requieren que el IAM responda. El IAM no tiene
refresh token, ni introspección, ni revocación, así que no hay alternativa.

> **No rotar `SESSION_SECRET` entre las 07:00 y las 09:00 de Chile:** rotarlo cierra
> todas las sesiones abiertas y obliga a todo el mundo a pasar por el IAM.

## Puesta en marcha (una sola vez)

### 1. Registrar DOS aplicaciones en el IAM

**Dos, no una.** No es higiene, es un bypass real: el IAM **no ata el authorization
code al `redirect_uri`** y el `client_secret` es **opcional** en su `/oauth/token`. Con
un `localhost` registrado en la aplicación de producción, cualquiera que conozca el
`client_id` (que es público por definición) puede mandarle a un usuario de SECOM un
enlace `…/oauth/authorize?client_id=<ID>&redirect_uri=http://localhost:5173/…`: la
víctima ve el IAM legítimo, teclea su clave real, y el código aterriza en cualquier
proceso que escuche en su `localhost`, que lo canjea sin secret y obtiene un token
válido con el rol real de la víctima.

| Aplicación | redirect_uris |
|---|---|
| `COIPO Monitor de Prensa` | `https://<HOST_PUBLICO>/auth/callback` |
| `COIPO Monitor de Prensa (dev)` | `http://localhost:8080/auth/callback`, `http://localhost:5173/auth/callback` |

El backend atiende el retorno del IAM en **las dos rutas**: `/auth/callback` (la que
usa el resto del ecosistema COIPO, porque en COIPO_APPTEST el intercambio lo hacía el
navegador) y `/api/auth/callback` (la natural acá, donde lo atiende el backend). Basta
con que `IAM_REDIRECT_URI` coincida con la que esté registrada; no hay que editar el
IAM solo por la ruta. nginx enruta la versión sin prefijo con un
`location = /auth/callback` explícito.

**No registrar la variante `http://` de producción.** Con `SESION_HTTPS_ONLY=true` el
navegador descartaría la cookie en silencio y el login no completaría nunca, con un
fallo mudo en vez del claro `redirect_uri no autorizada`. Que el reverse proxy redirija
HTTP → HTTPS.

El IAM compara el `redirect_uri` por **igualdad exacta de string**: una barra final de
más y el login falla.

### 2. Guardar las credenciales

El `client_secret` se muestra **una sola vez**. Anotar también el `id` numérico de la
aplicación → `IAM_APP_ID` (el JWT del IAM no trae claim `aud`; sin comparar `app_id`,
un token emitido para otra app CONAF entraría acá).

### 3. Crear el rol `admin` y asignarlo

En el panel del IAM, crear un rol llamado `admin` **para la aplicación de producción** y
asignárselo a quien corresponda. Todos los demás quedan en `general` por el fallback.

### 4. Completar el `.env`

Copiar de [`.env.example`](../.env.example). Lo mínimo:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
CLIENT_ID=…
CLIENT_SECRET=…
IAM_APP_ID=…
IAM_REDIRECT_URI=https://<HOST_PUBLICO>/auth/callback   # la registrada en el IAM
IAM_IP=<IP interna del IAM>
SESION_HTTPS_ONLY=true   # solo cuando el sitio se sirva por https
```

`IAM_IP` es obligatorio: `conaf.cl` usa DNS de horizonte partido y, desde dentro del
contenedor, `iam.conaf.cl` resuelve a la IP pública, inalcanzable desde el servidor de
aplicaciones. Sin `extra_hosts`, cada callback da ConnectTimeout de 10 s.

## Verificación después de desplegar

```bash
# El nombre del IAM resuelve a la IP interna
docker compose exec backend python -c "import socket;print(socket.gethostbyname('iam.conaf.cl'))"

# /api/noticias es PÚBLICO, pero con la carga útil reducida: 200 y SIN extracto ni
# análisis. Que devuelva 401 sería un despliegue mal configurado; que devuelva
# "extracto" a un anónimo es la fuga que el rediseño vino a cerrar.
curl -s https://<HOST>/api/noticias | grep -c '"extracto"'   # 0
curl -s https://<HOST>/api/noticias | grep -c '"analisis"'   # 0

# El resto sí exige sesión
curl -si https://<HOST>/api/me              # 401
curl -si https://<HOST>/api/historico       # 401
curl -si https://<HOST>/api/retiros         # 401 (el POST, en cambio, es público)
curl -si https://<HOST>/data/historico.json # 404 (nunca el JSON)

# El retorno del login llega al BACKEND, no a la SPA (si devuelve HTML, nginx lo
# está mandando al frontend y el código nunca se canjearía)
curl -si "https://<HOST>/auth/callback?code=x&state=y"   # 303 con Location, NO <!doctype html>

# /health responde SIEMPRE (lo usa el healthcheck de docker)
curl -s https://<HOST>/health               # 200; "configuracion": null si todo está cargado
```

En el navegador: entrar al sitio debe redirigir al IAM, y tras el login volver al
boletín. En DevTools → Application → Cookies tiene que existir `coipo_prensa_sesion`
marcada **HttpOnly**, y `localStorage` **sin ningún token**.

**La prueba de las 8:00 — correr antes de presentar a SECOM.** Con una sesión activa,
romper la resolución del IAM (`extra_hosts: "iam.conaf.cl:127.0.0.1"`), reiniciar el
backend y confirmar que `/api/noticias` **sigue respondiendo 200**. Es la única prueba
que demuestra que una caída del IAM no tumba el boletín.

## Administración de conceptos

Se editan en **Configuración** (`/#/configuracion`), con rol `admin`. Un concepto puede
ser una palabra o una frase; la detección ignora mayúsculas y tildes y respeta límites
de palabra («CONAF» encuentra «Conaf» y «(CONAF)», pero no «CONAFE»).

**Los cambios se aplican en la corrida siguiente del collector**, que corre cada hora en
punto. El panel muestra la hora concreta.

### Buscar vs. excluir

- **Buscar** (`incluir`): lo que hace entrar noticias. Debe quedar al menos uno activo;
  la API responde 409 si se intenta quitar el último.
  **Quitar uno detiene solo la recolección futura**: las noticias ya publicadas siguen
  en el boletín, porque la ventana no re-evalúa lo que ya entró. Para ocultarlas hay
  que agregar el término como concepto de **exclusión**.
- **Excluir**: **oculta, no borra**. Las noticias que lo mencionan se marcan
  (`excluida`, `excluida_por`) y desaparecen de la vista, pero siguen archivadas. Si se
  quita el concepto, **reaparecen** en la corrida siguiente, con su mismo extracto y su
  mismo evento.

La exclusión **gana** sobre la inclusión: una nota que menciona «CONAF» y «CMPC» queda
oculta si «CMPC» está excluido. Ese daño colateral es real y por eso el panel permite
**ver exactamente qué titulares oculta cada concepto** (botón de lupa) — es la forma de
comprobar que no se está perdiendo cobertura legítima.

Además, cada corrida deja en `colecta_ejecuciones.resumen` una línea por concepto
excluido con cuántas noticias ocultó, marcando `— ¿mal escrito?` las que ocultan cero, y
un `[FALLO]` si la exclusión oculta más de la mitad de la ventana.

### Si la base de datos falla

El collector **nunca se queda sin conceptos**: si la tabla no responde o queda sin
conceptos de búsqueda activos, usa la semilla de
[`collector/src/config/conceptos.js`](../collector/src/config/conceptos.js) y deja un
`[FALLO] Conceptos: …` en el resumen de la corrida. El boletín se publica igual.

Esa semilla y el `INSERT` de [`db/schema.sql`](../db/schema.sql) deben coincidir; hay un
test (`collector/test/semilla-conceptos.test.js`) que falla el build si divergen.
