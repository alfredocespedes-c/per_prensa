# Boletín contratado — lectura desde Gmail

Servicio Python en Docker que **lee el correo diario de Simbiu MediaStation, lo filtra y
registra el enlace del boletín** en la tabla `boletines_contratados` de COIPO_PRENSA.

Reemplaza al pegado manual que hacía un administrador. El panel de `/#/configuracion` se
mantiene, pero ya solo para **corregir**.

Sin navegador y sin OAuth interactivo: la autenticación es un refresh token en el entorno.

---

## Qué hace una pasada

1. Busca en Gmail los correos que casan con `GMAIL_QUERY` (con paginación real, >500).
2. De cada uno extrae el enlace del boletín, aplicando **tres filtros**.
3. Los guarda en `boletines_contratados`, de forma idempotente.
4. Imprime lo detectado **y lo descartado, con el motivo**.

### Los tres filtros

| Filtro | Qué rechaza | Por qué |
|---|---|---|
| **Remitente** | Cualquier dirección fuera de `BOLETIN_REMITENTES_PERMITIDOS` | La búsqueda de Gmail no autentica nada: sin esto, mandar un correo con ese asunto y un enlace bastaría para publicar lo que uno quiera en la portada |
| **Enlace** | Todo lo que no sea `https://<host permitido>/Documents/Download/<número>` | El correo trae decenas de enlaces (cada titular pasa por el rastreador del proveedor); solo uno es el documento |
| **Fecha** | Correos sin fecha reconocible | La fecha sale del **texto del boletín**, no de cuándo llegó el correo: un reenvío tardío del boletín de ayer llegaría hoy y se publicaría como el de hoy |

El remitente se resuelve con `email.utils.parseaddr`, no con una búsqueda de texto: el
nombre para mostrar lo elige quien envía, así que `"Noticias Conaf <noticias@conaf.cl>"
<atacante@example.com>` engaña a cualquier regex ingenua. Está cubierto por un test.

### Una corrección manual nunca se pisa

Si un administrador corrigió a mano el enlace de un día, queda con `origen = 'manual'` y la
lectura del correo **no lo modifica**. Sin esa regla, el servicio revertiría cada media
hora lo que la persona acaba de arreglar, y el síntoma sería que el enlace «vuelve solo» al
valor malo. Es el mismo error que ya está documentado en `CLAUDE.md` para
`archivarSecciones` y el orden de secciones.

---

## Puesta en marcha

### Dentro del stack (lo normal)

El servicio se llama `boletin-correo` y está en el `docker-compose.yml` de la **raíz** del
repositorio. Sus variables van en el `.env` de la raíz, junto a las de Postgres:

```bash
# en la raíz del repositorio
docker compose up -d --build
docker compose logs -f boletin-correo
```

Por defecto revisa **cada 30 minutos entre las 07:00 y las 13:59 de Chile**. El boletín
llega alrededor de las 08:00 y SECOM lo mira a las 08:00; releer el mismo correo es
idempotente, así que revisar de más no duplica nada.

### Suelto, para probar

```bash
cd gmail-boletin
cp .env.example .env       # y rellenar
docker compose up --build
```

Sin `DATABASE_HOST` no escribe en ninguna base: solo lista por consola lo que detectó. Es
la forma de probar credenciales y filtros sin tocar Postgres.

---

## Configurar el `.env`

`.env` está en `.gitignore` y **nunca** debe versionarse.

| Variable | Obligatoria | Por defecto | Para qué |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | sí | — | Cliente OAuth de Google Cloud |
| `GOOGLE_CLIENT_SECRET` | sí | — | Secreto de ese cliente |
| `GOOGLE_REFRESH_TOKEN` | sí | — | Token de larga vida con alcance `gmail.readonly` |
| `GMAIL_QUERY` | no | `subject:"Boletín SECOM CONAF"` | Búsqueda, sintaxis de Gmail |
| `GMAIL_MAX_RESULTADOS` | no | `20` | `0` = todos, paginando |
| `BOLETIN_REMITENTES_PERMITIDOS` | no | `noticias@conaf.cl` | Lista blanca; `@dominio.cl` vale para todo el dominio |
| `BOLETIN_HOSTS_PERMITIDOS` | no | `mediastation.simbiu.es` | Lista blanca de hosts del proveedor |
| `DATABASE_HOST` … `_PASSWORD` | no | — | Presencia de `DATABASE_HOST` = ingesta activa |
| `BOLETIN_INGESTA` | no | según `DATABASE_HOST` | Forzar el modo a mano |
| `GMAIL_INTERVALO_SEGUNDOS` | no | `0` | `0` = una pasada. `1800` = cada media hora |
| `BOLETIN_HORAS_ACTIVAS` | no | *(vacío)* | `7-13` = solo revisar en esa franja, hora de Chile |
| `TZ` | no | `America/Santiago` | Zona de las fechas |
| `LOG_LEVEL` | no | `INFO` | `DEBUG` para ver las peticiones HTTP |

### De dónde salen las credenciales

1. En Google Cloud Console, habilitar la **Gmail API** en el proyecto.
2. Crear credenciales OAuth de tipo **Aplicación de escritorio** → `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET`.
3. Autorizar **una sola vez** el alcance
   `https://www.googleapis.com/auth/gmail.readonly` con la cuenta que recibe el boletín y
   guardar el `refresh_token`. Ese paso es interactivo y ocurre **fuera** de esta
   aplicación, en una máquina con navegador: el contenedor nunca abre uno.

### Sobre el access token

Dura ~1 hora y **no se almacena en ninguna parte**: se deriva de `GOOGLE_REFRESH_TOKEN` en
cada arranque, y `google-auth` lo renueva sola si caduca a mitad de una corrida. Por eso no
existe `token.json` ni volumen para persistirlo — de hecho `token.json` está en
`.gitignore` para que nadie lo reintroduzca.

---

## Cómo probar que funciona

**1. Sin tocar la base** — confirma credenciales, permisos, red y filtros:

```bash
docker compose run --rm -e BOLETIN_INGESTA=false boletin-correo
```

Salida esperada: `Access token obtenido…`, una tabla `FECHA / DOCUMENTO / ENLACE` con los
boletines detectados, y una sección `DESCARTADOS` con el motivo de cada rechazo.

**2. Con ingesta**, y luego comprobar en Postgres:

```sql
SELECT fecha, documento_id, origen, registrado_por, actualizado_en
  FROM boletines_contratados ORDER BY fecha DESC LIMIT 10;
```

**3. Que la corrección manual se respeta** — es la regla que más duele si se rompe:
corrija un día desde `/#/configuracion` (queda `origen = 'manual'`), fuerce una pasada y
verifique que el resumen dice `1 con corrección manual respetada` y que la fila no cambió.

**4. Si algo falla**, el código de salida dice qué fue:

| Código | Significado | Qué revisar |
|---|---|---|
| `0` | correcto | — |
| `2` | configuración | El mensaje nombra las variables que faltan |
| `3` | autenticación | Refresh token revocado, de otro cliente, o sin `gmail.readonly` |
| `4` | Gmail API | Permisos, cuota agotada, API no habilitada |
| `5` | red o base de datos | Salida a internet, proxy, DNS, `DATABASE_*` |

**5. Si no encuentra correos** pero la conexión funciona, el problema es la búsqueda o el
filtro de remitente. La sección `DESCARTADOS` lo dice explícitamente — un filtro que
rechaza en silencio es indistinguible de un filtro roto.

---

## Estructura

```
app/
  config.py         Todo lo que se lee del entorno. Ningún otro módulo toca os.environ.
  autenticacion.py  Refresh token -> access token. Sin navegador, sin estado en disco.
  cliente_gmail.py  Servicio de Gmail y punto ÚNICO de reintentos y traducción de errores.
  busqueda.py       Búsqueda con paginación real (>500 mensajes).
  mensaje.py        Extracción de campos. Metadatos y correo completo, por separado.
  cuerpo.py         MIME recursivo, Base64 URL-safe, HTML a texto. Puro, sin red.
  extraccion.py     Del correo al enlace: los tres filtros. Puro, sin red ni base.
  repositorio.py    Escritura en boletines_contratados. Respeta la corrección manual.
  salida.py         Presentación por consola (stdout; el log va por stderr).
  registro.py       Logging con redacción de secretos.
  errores.py        Errores propios con su código de salida.
  __main__.py       Orquestación.
tests/              Las cuatro piezas con trampas: cuerpo, extracción, repositorio, log.
```

### Decisiones que conviene conocer

- **La fecha sale del texto del boletín**, no de `internalDate`, que solo es el respaldo.
  Un reenvío conserva el texto pero cambia la hora de llegada.
- **`format=full` es obligatorio** en este servicio: el enlace y la fecha están en el
  cuerpo, no en las cabeceras. El modo `metadata` existe igual porque sirve para
  diagnosticar sin descargar ~350 KB por correo.
- **El repositorio consulta y luego decide**, en vez de un `ON CONFLICT` con `WHERE`. La
  primera versión distinguía alta de corrección con `RETURNING (xmax = 0)`; funciona, pero
  depende de un detalle interno de Postgres y no había forma de comprobarlo. Tres ramas
  explícitas hacen lo mismo, se leen solas y se prueban con una conexión de mentira.
- **Este servicio no aplica `db/schema.sql`.** Lo hacen el collector y el backend; un
  tercer proceso ejecutando el mismo DDL sería una carrera esperando a ocurrir.
- **La redacción de secretos vive en el formateador, no en un filtro.** Un
  `logging.Filter` corre antes de que exista el traceback, así que no puede limpiarlo.
- **Sin dependencias de parseo HTML** (bs4/lxml): para pasar de HTML a texto legible no
  hace falta un árbol DOM, y cada dependencia es superficie de CVE en una imagen que corre
  desatendida.

---

## Desarrollo local (sin Docker)

```bash
python -m venv .venv
. .venv/Scripts/activate       # Linux/macOS:  . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest tests/ -q
BOLETIN_INGESTA=false python -m app
```

---

## Seguridad

- Ningún secreto en la imagen ni en el repositorio: todos entran por entorno en tiempo de
  ejecución. `.env`, `credentials.json` y `token.json` están en `.gitignore` y en
  `.dockerignore`.
- El log **nunca** imprime `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` ni el access
  token, ni siquiera dentro de un traceback de una biblioteca de terceros.
- Alcance `gmail.readonly`: no puede modificar ni borrar nada del buzón.
- El contenedor corre como usuario sin privilegios (uid 10001), con el sistema de archivos
  en solo lectura y `no-new-privileges`.
- **Lo que entra por correo es entrada no confiable.** Los tres filtros son el perímetro;
  la lista de remitentes es la parte que de verdad autoriza.
- Si un refresh token se expone (al pegarlo en un chat, un ticket o un log), revóquelo en
  https://myaccount.google.com/permissions y genere uno nuevo.
