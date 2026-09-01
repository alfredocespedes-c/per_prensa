-- Esquema de PostgreSQL para COIPO_PRENSA (v2).
--
-- Fuente ÚNICA de verdad del DDL: tanto el collector (Node, ver
-- collector/src/adaptadores/archivador-postgres.js) como el backend (FastAPI, ver
-- backend/app/db/bootstrap.py) ejecutan este archivo tal cual al arrancar/conectar,
-- de forma idempotente (CREATE TABLE/INDEX IF NOT EXISTS). Ninguno de los dos crea la
-- base de datos (CREATE DATABASE): la base y el usuario ya existen en el servidor
-- (compartido, administrado aparte). No agregar `Base.metadata.create_all()` en
-- backend/app/db/models.py — ese archivo es solo de consulta, este .sql es la única
-- autoridad de esquema.
--
-- Candado de arranque: ambos lados envuelven la ejecución de este archivo en
-- SELECT pg_advisory_lock(487200917); ... SELECT pg_advisory_unlock(487200917);
-- para que dos contenedores arrancando a la vez no choquen creando las tablas al
-- mismo tiempo. 487200917 es una constante arbitraria elegida para este proyecto;
-- si en el futuro el servidor <HOST_BD> aloja otra app que también usa advisory
-- locks, cambiarla aquí y en ambos lados.

CREATE TABLE IF NOT EXISTS secciones (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS noticias (
  id                TEXT PRIMARY KEY,              -- URL canónica (misma clave que noticias.json)
  url               TEXT NOT NULL,
  medio_id          TEXT NOT NULL,
  medio_nombre      TEXT NOT NULL,
  seccion_id        TEXT NOT NULL REFERENCES secciones(id),
  titular           TEXT NOT NULL,
  fecha             TIMESTAMPTZ,
  fecha_deteccion   TIMESTAMPTZ NOT NULL,
  extracto          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{texto,resaltado}] verbatim
  -- SIN columna `imagen`. El sistema guardaba la URL del og:image y el navegador la pedía
  -- al servidor del medio; el departamento legal resolvió eliminar las imágenes de las dos
  -- superficies, así que el dato dejó de existir. Las bases creadas antes la pierden en el
  -- bloque DO $$ del final. No reintroducirla.
  autor             TEXT,
  fecha_real        TIMESTAMPTZ,
  event_id          TEXT,
  analisis          JSONB,                          -- objeto Analisis completo verbatim, o NULL
  -- Exclusión por marcado suave (v3): la noticia se oculta, NO se borra. El flag se
  -- RECALCULA en cada corrida sobre toda la ventana (ver dominio/exclusiones.js), así
  -- que quitar el concepto la restaura. `excluida_por` guarda POR QUÉ, lo que permite
  -- revertir sobre el archivo sin volver a evaluar texto.
  excluida          BOOLEAN NOT NULL DEFAULT false,
  excluida_por      TEXT[]  NOT NULL DEFAULT '{}',
  -- Denormalizados de analisis (índices/filtros; ver dominio/enriquecimiento.js):
  sentimiento       TEXT,
  riesgo            TEXT,
  prioridad         SMALLINT,
  importancia       SMALLINT,
  ambito            TEXT,
  categorias        TEXT[] NOT NULL DEFAULT '{}',
  regiones          TEXT[] NOT NULL DEFAULT '{}',
  primera_vista_en  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- solo se fija en el INSERT, nunca se actualiza
  actualizada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_noticias_fecha   ON noticias (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_noticias_medio   ON noticias (medio_id);
CREATE INDEX IF NOT EXISTS idx_noticias_seccion ON noticias (seccion_id);
CREATE INDEX IF NOT EXISTS idx_noticias_evento  ON noticias (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_noticias_categ   ON noticias USING GIN (categorias);
CREATE INDEX IF NOT EXISTS idx_noticias_region  ON noticias USING GIN (regiones);
-- Índice de la columna de filtro/orden de GET /api/historico (SEC-02): sin él, cada
-- consulta histórica era un seq-scan del heap; con él, el filtro por rango es eficiente.
CREATE INDEX IF NOT EXISTS idx_noticias_deteccion ON noticias (fecha_deteccion DESC);

-- Metadatos de la última colecta: equivalente a generadoEn/tamanoVentana del JSON,
-- con la MISMA semántica de "generado_en solo cambia si cambió el contenido" (ver
-- collector/src/main.js, cálculo de `noticiasIguales`). Fila única forzada por el CHECK.
--
-- Nota: esto es independiente de datos/historico.json (rotación de 400 días que el
-- collector ya genera) y del futuro endpoint GET /api/historico (respaldado por la
-- tabla `noticias`, que crece sin borrar filas). No confundir los tres.
CREATE TABLE IF NOT EXISTS coleccion_metadatos (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  generado_en    TIMESTAMPTZ NOT NULL,
  tamano_ventana INT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auditoría de corridas del collector: UNA fila por cada activación del cron horario
-- (ver collector/src/main.js y collector/crontab). Aditiva (solo INSERT, nunca DELETE),
-- independiente de coleccion_metadatos (que guarda solo el ÚLTIMO estado). Sirve para
-- verificar que el collector se activó cada hora y qué recolectó en cada corrida, sin
-- necesidad de acceso a la máquina: una hora sin fila = corrida que no disparó o que
-- murió antes de archivar.
CREATE TABLE IF NOT EXISTS colecta_ejecuciones (
  id                  BIGSERIAL PRIMARY KEY,
  iniciada_en         TIMESTAMPTZ NOT NULL,               -- inicio de la corrida
  finalizada_en       TIMESTAMPTZ NOT NULL DEFAULT now(), -- momento del registro (fin)
  duracion_ms         INTEGER NOT NULL,                   -- duración total de la corrida
  exito               BOOLEAN NOT NULL,                   -- alguna fuente entregó datos
  noticias_publicadas INTEGER NOT NULL DEFAULT 0,         -- total en la ventana tras fusionar
  noticias_nuevas     INTEGER NOT NULL DEFAULT 0,         -- detectadas nuevas en esta corrida
  noticias_previas    INTEGER NOT NULL DEFAULT 0,         -- venían del estado anterior
  pasos_ok            SMALLINT NOT NULL DEFAULT 0,        -- líneas [OK] del resumen
  pasos_fallidos      SMALLINT NOT NULL DEFAULT 0,        -- líneas [FALLO] del resumen
  resumen             JSONB NOT NULL DEFAULT '[]'::jsonb  -- lineasResumen verbatim (detalle por fuente/paso)
);

CREATE INDEX IF NOT EXISTS idx_colecta_ejecuciones_inicio ON colecta_ejecuciones (iniciada_en DESC);

-- Log de la purga de retención: UNA fila por corrida diaria de collector/src/purga.js.
-- Es el "log de ejecución" que exige la política de retención: sin él, "los extractos se
-- purgan a los 180 días" sería una afirmación no verificable.
--
-- Se registran también las corridas en modo simulación (`simulacion = true`), donde los
-- contadores son lo que se HABRÍA borrado. Distinguirlas importa: una noche en modo
-- simulación no purgó nada, y sin la columna el log diría lo contrario.
--
-- Esta tabla NO se auto-purga: son ~365 filas al año y son la prueba de cumplimiento.
CREATE TABLE IF NOT EXISTS purga_ejecuciones (
  id                   BIGSERIAL PRIMARY KEY,
  iniciada_en          TIMESTAMPTZ NOT NULL,
  finalizada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  duracion_ms          INTEGER NOT NULL,
  exito                BOOLEAN NOT NULL,
  simulacion           BOOLEAN NOT NULL DEFAULT false,
  extractos_purgados   INTEGER NOT NULL DEFAULT 0,   -- noticias que perdieron su texto
  noticias_borradas    INTEGER NOT NULL DEFAULT 0,   -- filas eliminadas de `noticias`
  ejecuciones_borradas INTEGER NOT NULL DEFAULT 0,   -- filas eliminadas de colecta_ejecuciones
  resumen              JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_purga_ejecuciones_inicio ON purga_ejecuciones (iniciada_en DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Autenticación (v3): la app queda detrás del login del IAM COIPO (repo
-- COIPO_USUARIOS). NO hay tabla de usuarios acá A PROPÓSITO — la identidad y los
-- roles son del IAM; duplicarlos crearía una segunda verdad que se desincroniza (un
-- rol cambiado en el IAM no propagaría) y metería datos personales en reposo a
-- cambio de cero funcionalidad. Además, un upsert de usuario en el camino del login
-- convertiría un parpadeo de Postgres en "nadie entra a las 8:00".
--
-- Lo único que se persiste es la TRAZA de quién hizo qué. Importa sobre todo por los
-- conceptos: definen QUÉ se publica, así que un cambio equivocado puede hacer
-- desaparecer noticias del boletín y sin traza es indistinguible de un fallo del
-- collector.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auditoria (
  id           BIGSERIAL PRIMARY KEY,
  ocurrido_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  evento       TEXT NOT NULL,        -- LOGIN_OK, LOGOUT, CONCEPTO_CREADO, ...
  usuario_sub  TEXT,                 -- `sub` del IAM (users.id como string)
  usuario      TEXT,                 -- username AL MOMENTO del evento (denormalizado
                                     -- a propósito: la traza debe conservar el nombre
                                     -- que tenía cuando ocurrió el hecho)
  rol          TEXT,
  -- TEXT y no INET a propósito: acá se guarda la CADENA de X-Forwarded-For (hasta 3
  -- proxies), que no es una IP única. Con INET, un valor inesperado abortaría el
  -- INSERT y, con él, el login.
  ip_origen    TEXT,
  objeto       TEXT,                 -- 'concepto' | NULL
  objeto_id    TEXT,
  detalle      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_auditoria_ocurrido ON auditoria (ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_evento   ON auditoria (evento, ocurrido_en DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Conceptos de búsqueda y de exclusión, editables desde la web por el rol "admin".
-- Reemplazan a collector/src/config/conceptos.js como fuente OPERATIVA; ese archivo
-- queda como SEMILLA (el INSERT del final de este bloque) y como FALLBACK del
-- collector si la base no responde (ver adaptadores/repositorio-conceptos-postgres.js).
--
-- UNA sola tabla con columna `tipo`, no dos tablas: los dos conjuntos tienen la misma
-- forma, la misma validación y el mismo CRUD, pero sobre todo COMPARTEN el índice
-- único — que es lo único capaz de impedir el estado contradictorio "CONAF está a la
-- vez en incluir y en excluir". Con dos tablas esa garantía no es expresable en
-- Postgres (no existe UNIQUE entre tablas) y habría que emularla con un trigger.
--
-- `texto_normalizado` es una columna GENERADA cuyo ÚNICO fin es la unicidad
-- insensible a mayúsculas y tildes: sin ella entrarían "CONAF", "conaf" y "Conaf"
-- como tres conceptos distintos y el detector escanearía tres veces lo mismo. NO se
-- usa para detectar menciones: eso sigue ocurriendo en JS (dominio/menciones.js).
--
-- A propósito NO se usa la extensión `unaccent`: (a) CREATE EXTENSION exige un
-- permiso que no controlamos en el servidor compartido; (b) unaccent() es STABLE, no
-- IMMUTABLE, así que Postgres la rechaza en columnas generadas e índices; y (c) este
-- archivo se ejecuta como UN solo lote multi-sentencia en transacción implícita, así
-- que una sentencia que falle por permisos abortaría TODO el esquema, incluidas las
-- tablas de noticias. Todo lo de abajo es core e IMMUTABLE.
--
-- Las mayúsculas acentuadas van EXPLÍCITAS en translate() porque el locale de la base
-- compartida no está documentado: con LC_CTYPE=C, lower('Ó') es la identidad y
-- 'CORPORACIÓN' normalizaría distinto de 'Corporación'.
--
-- [[:space:]] en vez de \s: no depende de standard_conforming_strings.
CREATE TABLE IF NOT EXISTS conceptos (
  id                BIGSERIAL PRIMARY KEY,
  texto             TEXT NOT NULL,          -- tal cual lo tecleó el admin, 1+ palabras
  tipo              TEXT NOT NULL,          -- 'incluir' | 'excluir'
  activo            BOOLEAN NOT NULL DEFAULT true,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por        TEXT,                   -- username del IAM, o 'semilla'
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por   TEXT,
  texto_normalizado TEXT GENERATED ALWAYS AS (
    translate(
      lower(normalize(btrim(regexp_replace(texto, '[[:space:]]+', ' ', 'g')), NFC)),
      'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
      'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN'
    )
  ) STORED,

  CONSTRAINT conceptos_tipo_valido  CHECK (tipo IN ('incluir', 'excluir')),
  -- Piso duro contra inserciones a mano por psql. La regla FINA (largo, número de
  -- palabras, comillas) vive en collector/src/dominio/conceptos.js y en
  -- backend/app/servicios/conceptos.py; acá solo lo que evita un desastre.
  CONSTRAINT conceptos_largo        CHECK (char_length(btrim(texto)) BETWEEN 3 AND 80),
  CONSTRAINT conceptos_con_letra    CHECK (texto ~ '[[:alnum:]]')
);

-- Unicidad GLOBAL (no por tipo): impide "CONAF" en incluir y "conaf" en excluir al
-- mismo tiempo. Mover un concepto de un conjunto al otro es un UPDATE de `tipo`, no
-- un DELETE+INSERT, y así conserva su auditoría.
CREATE UNIQUE INDEX IF NOT EXISTS ux_conceptos_normalizado ON conceptos (texto_normalizado);

-- La consulta caliente es la del collector, una vez por hora: "los activos por tipo".
CREATE INDEX IF NOT EXISTS idx_conceptos_activos ON conceptos (tipo) WHERE activo;

-- SEMILLA — espejo de collector/src/config/conceptos.js (CONCEPTOS).
-- collector/test/semilla-conceptos.test.js compara ambas listas y falla el build si
-- divergen, para que "semilla + fallback" no se convierta en dos verdades distintas.
--
-- WHERE NOT EXISTS (tabla vacía), NO un ON CONFLICT DO NOTHING por fila: este archivo
-- corre en CADA corrida del collector y en cada arranque del backend. Con ON CONFLICT
-- por fila, si el admin RENOMBRA un concepto ('forestal' -> 'brigada forestal'), la
-- clave 'forestal' queda libre y el concepto RESUCITA en menos de una hora, sin que
-- el admin pueda entender por qué. Así la semilla actúa una sola vez en la vida de la
-- base y no queda acoplada a que el borrado sea suave.
INSERT INTO conceptos (texto, tipo, creado_por)
SELECT semilla.texto, 'incluir', 'semilla'
FROM (VALUES
  ('CONAF'),
  ('Corporación Nacional Forestal'),
  ('CMPC'),
  ('forestal'),
  ('Parque Nacional'),
  ('forestin'),
  ('sernafor')
) AS semilla(texto)
WHERE NOT EXISTS (SELECT 1 FROM conceptos);

-- ─────────────────────────────────────────────────────────────────────────────
-- Solicitudes de retiro: la vía por la que un medio pide que dejemos de listar una nota
-- suya, o todas. La crea CUALQUIERA sin sesión (POST /api/retiros): exigirle una cuenta
-- en el IAM de CONAF al dueño del contenido convertiría el derecho en un trámite
-- inaccesible. Pero crear la solicitud NO retira nada — si bastara con enviar el
-- formulario, cualquiera podría vaciar el boletín. La APLICA un admin, y recién ahí
-- surte efecto.
--
-- El efecto de un retiro aplicado se hace valer en DOS capas:
--   1) LECTURA (backend/app/routers/noticias.py e historico.py): se filtra en la
--      consulta, así que el retiro es inmediato en ambas superficies y no espera la
--      corrida horaria del recolector.
--   2) INGESTA (collector): las claves retiradas se descartan al recolectar, para que la
--      nota no vuelva a entrar en la siguiente corrida.
-- Sin la capa 1 el retiro tardaría hasta una hora; sin la capa 2 volvería solo.
--
-- `clave` es la URL canónica (ambito='noticia') o el medio_id/dominio (ambito='medio').
-- No hay FK a `noticias`: se puede pedir el retiro de una nota que todavía no se
-- recolectó, o de una que ya salió de la ventana, y una FK haría fallar ambos casos.
CREATE TABLE IF NOT EXISTS retiros (
  id           BIGSERIAL PRIMARY KEY,
  ambito       TEXT NOT NULL,
  clave        TEXT NOT NULL,
  motivo       TEXT,
  solicitante  TEXT,
  contacto     TEXT,
  estado       TEXT NOT NULL DEFAULT 'pendiente',
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_origen    TEXT,                 -- misma semántica que auditoria.ip_origen (cadena XFF)
  aplicado_en  TIMESTAMPTZ,
  aplicado_por TEXT,

  CONSTRAINT retiros_ambito_valido CHECK (ambito IN ('noticia', 'medio')),
  CONSTRAINT retiros_estado_valido CHECK (estado IN ('pendiente', 'aplicado', 'rechazado')),
  CONSTRAINT retiros_clave_no_vacia CHECK (char_length(btrim(clave)) BETWEEN 1 AND 500)
);

-- Índice parcial sobre lo ÚNICO que se consulta en el camino caliente: las claves
-- aplicadas, que se leen en cada GET /api/noticias. Las pendientes y rechazadas solo las
-- mira el panel de admin.
CREATE INDEX IF NOT EXISTS idx_retiros_aplicados
  ON retiros (ambito, clave) WHERE estado = 'aplicado';

CREATE INDEX IF NOT EXISTS idx_retiros_creado ON retiros (creado_en DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIONES ADITIVAS — van al FINAL del archivo, y nunca como ALTER suelto.
--
-- El resto de este archivo son CREATE ... IF NOT EXISTS, que toman a lo sumo un
-- ShareLock (bloquean escrituras, no lecturas). Un `ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS`, en cambio, toma ACCESS EXCLUSIVE aunque sea no-op, y lo retiene hasta el
-- COMMIT del lote completo (este archivo corre como UNA transacción implícita). Como
-- el collector lo ejecuta en CADA corrida horaria, un ALTER suelto bloquearía los
-- SELECT de /api/noticias una vez por hora, para siempre: con statement_timeout=15 s
-- (backend/app/db/session.py) eso es un 500 en la portada, y si toca la corrida de las
-- 08:00 es literalmente el error #1 declarado inaceptable por SECOM.
--
-- El bloque DO consulta primero information_schema: en régimen no ejecuta ningún ALTER
-- y por lo tanto no pide ningún lock. Solo la primera vez, y por milisegundos.
--
-- Bases nuevas: las columnas ya vienen en el CREATE TABLE de arriba y este bloque es
-- un no-op. Bases existentes: acá se agregan. Ambas convergen al mismo esquema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'noticias' AND column_name = 'excluida'
  ) THEN
    EXECUTE 'ALTER TABLE noticias ADD COLUMN excluida BOOLEAN NOT NULL DEFAULT false';
    EXECUTE 'ALTER TABLE noticias ADD COLUMN excluida_por TEXT[] NOT NULL DEFAULT ''{}''';
  END IF;
END $$;

-- Jerarquía de presentación de dos niveles (concepto -> tipo de medio).
--
-- Nivel 1: `conceptos.orden`. Nivel 2: `secciones.orden`, que YA existía pero era un
-- valor fijo del código; ahora lo manda la base y se edita desde /#/configuracion.
--
-- `conceptos_detectados` y `concepto_principal` en `noticias` son la contraparte de
-- `excluida_por`: hasta ahora se sabía qué concepto OCULTABA una noticia, pero no cuál la
-- había hecho entrar, así que era imposible agrupar el boletín por concepto. Se
-- recalculan en cada corrida sobre la ventana completa (ver dominio/inclusiones.js), de
-- modo que renombrar o reordenar conceptos se refleja sin volver a pedir nada a los medios.
--
-- `concepto_principal` es el primero por `conceptos.orden` entre los detectados: cada
-- noticia aparece UNA sola vez en el boletín, nunca repetida bajo varios conceptos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conceptos' AND column_name = 'orden'
  ) THEN
    EXECUTE 'ALTER TABLE conceptos ADD COLUMN orden INTEGER NOT NULL DEFAULT 0';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'noticias' AND column_name = 'concepto_principal'
  ) THEN
    EXECUTE 'ALTER TABLE noticias ADD COLUMN conceptos_detectados TEXT[] NOT NULL DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE noticias ADD COLUMN concepto_principal TEXT';
  END IF;
END $$;

-- Un tipo de medio oculto DENTRO de un concepto. Tabla dispersa: solo guarda lo oculto,
-- así que "todo visible" —el caso normal— no cuesta ninguna fila.
--
-- El ORDEN de los tipos es global (`secciones.orden`) y no por concepto: es la decisión
-- tomada al definir el rediseño. Lo que sí es por concepto es la VISIBILIDAD.
CREATE TABLE IF NOT EXISTS concepto_tipo_oculto (
  concepto_id BIGINT NOT NULL REFERENCES conceptos(id) ON DELETE CASCADE,
  seccion_id  TEXT   NOT NULL REFERENCES secciones(id),
  PRIMARY KEY (concepto_id, seccion_id)
);

-- Orden inicial del nivel 1: el de creación, una sola vez. A partir de ahí manda la UI.
-- El WHERE impide que una corrida posterior pise un orden ya editado a mano.
UPDATE conceptos SET orden = sub.fila
FROM (
  SELECT id, row_number() OVER (ORDER BY creado_en, id) AS fila FROM conceptos
) AS sub
WHERE conceptos.id = sub.id
  AND conceptos.orden = 0
  AND NOT EXISTS (SELECT 1 FROM conceptos c2 WHERE c2.orden <> 0);

CREATE INDEX IF NOT EXISTS idx_noticias_concepto ON noticias (concepto_principal);

-- Eliminación de las imágenes de noticias (decisión del departamento legal).
--
-- Es la ÚNICA migración de este archivo que destruye datos, y es a propósito: no basta con
-- dejar de mostrar la imagen, porque la URL seguía almacenada en unas 3 de cada 4 filas y
-- la purga de retención nunca la tocaba (ver dominio/retencion.js: solo vacía el extracto y
-- los campos de texto de `analisis`, así que la URL sobrevivía los 180 días y solo
-- desaparecía con el borrado de fila a los 400).
--
-- DROP COLUMN y no UPDATE ... SET imagen = NULL: el UPDATE deja el valor viejo en las
-- versiones antiguas de cada fila hasta que pase el VACUUM, y además mantendría la columna
-- disponible para que alguien la repueble.
--
-- Va dentro del bloque guardado por el mismo motivo que el resto: este archivo se ejecuta
-- en CADA corrida horaria del collector y en cada arranque del backend. Un ALTER desnudo
-- tomaría ACCESS EXCLUSIVE sobre `noticias` una vez por hora y, con statement_timeout=15s
-- en el backend, sería un 500 en la portada. Con la comprobación previa, el ALTER corre una
-- sola vez en la vida de la base.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'noticias' AND column_name = 'imagen'
  ) THEN
    EXECUTE 'ALTER TABLE noticias DROP COLUMN imagen';
  END IF;
END $$;

-- A propósito NO se crea un índice GIN sobre excluida_por: solo lo usaría la consulta
-- de impacto del panel de admin (esporádica, sobre miles de filas) y se construiría
-- dentro de la misma transacción que acaba de tomar el ACCESS EXCLUSIVE.

-- ─────────────────────────────────────────────────────────────────────────────
-- Boletín de prensa del servicio CONTRATADO por CONAF (Simbiu MediaStation).
--
-- Lo que se guarda acá es UN ENLACE, no un boletín: fecha, URL, identificador del
-- documento en el proveedor, y quién/cuándo lo registró. NADA del contenido — ni el
-- HTML, ni los titulares, ni ninguna de las imágenes que ese HTML incrusta (el boletín
-- del 26 de agosto de 2026 traía 278). El boletín se abre en el sitio del proveedor, en
-- pestaña nueva. Es coherente con la decisión 6-bis (sin imágenes de prensa) y con la 8
-- (el cuerpo no se persiste): guardar ese HTML sería almacenar prensa de terceros que
-- además ni siquiera recolectamos nosotros.
--
-- `origen` existe desde el día uno con sus DOS valores aunque hoy solo se use 'manual'.
-- Es la bisagra de la decisión 4 (hexagonal): cuando el enlace lo descubra un adaptador
-- de correo en vez de un admin pegándolo, la lectura y la presentación no cambian y NO
-- hace falta un ALTER —que en este archivo, ejecutado cada hora, es justamente lo caro.
--
-- Unicidad por (proveedor, fecha): el proveedor emite UN boletín por día. Sin ella, un
-- admin que pega dos veces —o dos admins la misma mañana— dejarían dos filas para el
-- mismo día y "el último por fecha" sería no determinista. Con ella, el segundo registro
-- es una CORRECCIÓN, y la traza queda en `auditoria`.
--
-- La cota SUPERIOR de `fecha` no puede estar acá: un CHECK debe ser IMMUTABLE y
-- CURRENT_DATE es STABLE. Postgres rechazaría la sentencia y, como este archivo corre
-- como UN solo lote transaccional, se caería el esquema COMPLETO —incluida `noticias`—
-- en cada corrida horaria del collector y en cada arranque del backend. Esa cota vive en
-- backend/app/servicios/boletin_contratado.py.
CREATE TABLE IF NOT EXISTS boletines_contratados (
  id              BIGSERIAL PRIMARY KEY,
  proveedor       TEXT NOT NULL DEFAULT 'simbiu',
  fecha           DATE NOT NULL,                  -- día del boletín, hora de Chile
  url             TEXT NOT NULL,
  documento_id    TEXT NOT NULL,                  -- id del documento en el proveedor
  origen          TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'correo'
  registrado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  registrado_por  TEXT,                           -- usuario del IAM
  registrado_sub  TEXT,                           -- `sub` del IAM
  ip_origen       TEXT,                           -- misma semántica que auditoria.ip_origen
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por TEXT,

  CONSTRAINT boletines_contratados_proveedor CHECK (proveedor ~ '^[a-z0-9-]{2,32}$'),
  CONSTRAINT boletines_contratados_origen    CHECK (origen IN ('manual', 'correo')),
  -- Piso duro contra un INSERT a mano por psql. La regla FINA (lista blanca de host,
  -- patrón de ruta, credenciales embebidas) vive en el servicio del backend; acá solo
  -- lo que evita un desastre: HTTPS obligatorio y sin '@' en la autoridad.
  CONSTRAINT boletines_contratados_url_https CHECK (url ~ '^https://[a-zA-Z0-9.-]+/[^@[:space:]]*$'),
  CONSTRAINT boletines_contratados_url_largo CHECK (char_length(url) BETWEEN 12 AND 300),
  CONSTRAINT boletines_contratados_documento CHECK (documento_id ~ '^[0-9]{1,12}$'),
  CONSTRAINT boletines_contratados_fecha_piso CHECK (fecha >= DATE '2026-01-01')
);

-- UN boletín por proveedor y día. Es lo que convierte "pegar dos veces" en corrección
-- en vez de duplicado, y lo que hace determinista "el último".
CREATE UNIQUE INDEX IF NOT EXISTS ux_boletines_contratados_dia
  ON boletines_contratados (proveedor, fecha);

-- La consulta caliente es "el más reciente", en CADA carga de portada de un usuario con
-- sesión. El índice único de arriba solo serviría si la consulta fijara `proveedor`;
-- esta no lo exige. Son ~250 filas al año: el índice no cuesta nada.
CREATE INDEX IF NOT EXISTS idx_boletines_contratados_fecha
  ON boletines_contratados (fecha DESC);

-- Noticias DENTRO del boletín contratado, para poder mostrarlo dividido por secciones en
-- vez de un único enlace al documento completo.
--
-- QUÉ SE GUARDA: titular, medio, fecha, página y el enlace propio de esa noticia. NO se
-- guarda el extracto, aunque el boletín lo trae: dos líneas del texto del medio son
-- reproducción de contenido ajeno, y la decisión fue quedarse en la referencia. Tampoco
-- se guarda ninguna imagen — el documento trae 278 y ninguna entra acá (decisión 6-bis).
--
-- `url` es el enlace que el propio boletín pone en el titular: un PDF del recorte alojado
-- por el proveedor para prensa escrita, radio y TV, y su versión del artículo para los
-- medios digitales. Clicar en la noticia hace exactamente lo mismo que clicar en el
-- boletín; no se aloja ni se proxea nada.
--
-- ON DELETE CASCADE: la retención se aplica borrando el boletín padre, y las noticias se
-- van con él. Sin la cascada habría que acordarse de borrarlas aparte, que es justo lo
-- que no ocurre.
CREATE TABLE IF NOT EXISTS boletin_contratado_noticias (
  id          BIGSERIAL PRIMARY KEY,
  boletin_id  BIGINT  NOT NULL REFERENCES boletines_contratados(id) ON DELETE CASCADE,
  orden       INTEGER NOT NULL,          -- posición dentro del documento
  concepto    TEXT NOT NULL DEFAULT '',  -- nivel 1: CONAF, SERNAFOR, Sector Forestal
  tipo        TEXT NOT NULL DEFAULT '',  -- nivel 2: Impresos, Radio, Tv, Digital
  ambito      TEXT NOT NULL DEFAULT '',  -- nivel 3: Santiago, Regionales
  titular     TEXT NOT NULL,
  medio       TEXT NOT NULL DEFAULT '',
  fecha       DATE,
  pagina      TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL,

  CONSTRAINT boletin_noticias_titular   CHECK (char_length(titular) BETWEEN 1 AND 400),
  CONSTRAINT boletin_noticias_url_https CHECK (url ~ '^https://[a-zA-Z0-9.-]+/[^@[:space:]]*$'),
  -- Ninguna URL de imagen: la guarda vive también en el parser, y acá queda como piso
  -- duro contra una inserción a mano.
  CONSTRAINT boletin_noticias_sin_imagen CHECK (url !~* '\.(png|jpe?g|gif|webp|svg)$')
);

-- Una noticia por posición dentro de cada boletín: vuelve idempotente reprocesar el mismo
-- documento y hace determinista el orden de presentación.
CREATE UNIQUE INDEX IF NOT EXISTS ux_boletin_noticias_orden
  ON boletin_contratado_noticias (boletin_id, orden);

-- La consulta caliente es "todas las de este boletín, en orden".
CREATE INDEX IF NOT EXISTS idx_boletin_noticias_boletin
  ON boletin_contratado_noticias (boletin_id, orden);
