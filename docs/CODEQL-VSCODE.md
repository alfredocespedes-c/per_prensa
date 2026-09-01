# La extensión de CodeQL para VS Code, paso a paso

Guía práctica de la herramienta. Es el complemento del [curso](CODEQL.md), que enseña el
lenguaje: aquí no se aprende QL, se aprende a manejar el entorno donde se escribe.

Todos los comandos los corres **tú**. Cuando algo no coincida con lo que ves en pantalla,
abre la paleta con `Ctrl+Shift+P` y escribe `CodeQL:` — te lista todos los comandos de la
extensión, y esa lista es la verdad de tu versión.

---

## 0. Dos cosas de tu máquina, antes de empezar

### Disco: vas justo

```
C:  221 GB totales · 214 GB usados · 6,5 GB libres (98 %)
```

Lo que va a consumir CodeQL, en orden:

| Cosa | Espacio aproximado |
|---|---|
| `codeql-win64.zip` descargado | 398 MB (se borra después de extraer) |
| CLI extraído | ~1,2–1,6 GB |
| Base de datos JS de este repo | unos cientos de MB |
| Base de datos Python de este repo | menos, es un árbol chico |
| Packs de consultas descargados a demanda | ~200–400 MB |

Cabe, pero sin margen. Dos consecuencias prácticas:

1. **Baja el CLI pelado, no el bundle.** El curso recomienda el bundle
   (`codeql-bundle-win64.tar.gz`) porque trae los packs precompilados, pero pesa bastante
   más una vez extraído. Con 6,5 GB libres no es la elección correcta: baja
   `codeql-win64.zip` y deja que los packs se descarguen cuando hagan falta. Tu red da
   7,3 MB/s, así que no lo vas a notar.
2. **Crea una base a la vez**, no las dos con `--db-cluster`. Empieza por JavaScript.

### Red: no era tu problema

El log que viste —`Unable to install CodeQL CLI. The download timed out.`— parece un
problema de conexión y no lo es. Medido desde tu propia máquina:

```
codeql-win64.zip v2.26.3 = 417.759.216 bytes (398 MB)
velocidad medida        = 7,3 MB/s, con soporte de rangos (HTTP 206)
```

Eso son unos 55 segundos de descarga. El que se rindió fue el descargador de la
extensión, no tu enlace. Por eso el arreglo es bajarlo con una herramienta que sepa
**reintentar y reanudar**, que es lo que hace el paso 1.

---

## 1. Desbloquear el CLI

### Opción A: reintentar (30 segundos, prueba esto primero)

`Ctrl+Shift+P` → **CodeQL: Check for CLI Updates**. Si el timeout fue transitorio, la
descarga arranca de nuevo y te ahorras el resto de la sección. Mira el progreso en la
barra de estado.

Si vuelve a fallar, no insistas: pasa a la opción B.

### Opción B: bajarlo tú y decirle a la extensión dónde quedó

La extensión gestiona el CLI **por defecto**, pero acepta que le pases uno propio. Eso es
justo para lo que existe el ajuste `codeQL.cli.executablePath`.

**Paso 1 — descargar, con reintentos y reanudable.** En PowerShell:

```powershell
$dir = "$env:LOCALAPPDATA\Programs\codeql"
New-Item -ItemType Directory -Force $dir | Out-Null

curl.exe -L --retry 5 --retry-delay 3 -C - -o "$dir\codeql-win64.zip" `
  https://github.com/github/codeql-cli-binaries/releases/download/v2.26.3/codeql-win64.zip
```

Las tres banderas que faltaban en el intento de la extensión:
`--retry 5` reintenta, `--retry-delay 3` espera entre intentos, y **`-C -` reanuda desde
donde se cortó** en vez de empezar de cero. Si se corta a mitad, vuelve a correr el mismo
comando: sigue donde iba.

**Paso 2 — extraer y borrar el zip** (lo segundo importa, son 398 MB que no te sobran):

```powershell
Expand-Archive -Path "$dir\codeql-win64.zip" -DestinationPath $dir -Force
Remove-Item "$dir\codeql-win64.zip"
& "$dir\codeql\codeql.exe" --version
```

La última línea debe imprimir `2.26.3`. Fíjate en la ruta: el zip trae una carpeta
`codeql` dentro, así que el ejecutable queda en `…\Programs\codeql\codeql\codeql.exe`.
Ese doble `codeql` confunde a todo el mundo la primera vez.

**Paso 3 — decírselo a la extensión.** `Ctrl+Shift+P` → **Preferences: Open User
Settings (JSON)** y añade:

```json
"codeQL.cli.executablePath": "C:\\Users\\limc_\\AppData\\Local\\Programs\\codeql\\codeql\\codeql.exe"
```

Barras dobles: es JSON, la contrabarra se escapa.

**Paso 4 — recargar.** `Ctrl+Shift+P` → **Developer: Reload Window**.

### Comprobar que quedó bien

Abre el panel **Output** (`Ctrl+Shift+U`) y en el desplegable elige **CodeQL Extension**.
Debe decir que encontró el CLI en la ruta que pusiste, sin más `Could not find CodeQL on
path`.

---

## 2. El mapa: las vistas de la barra lateral

Haz clic en el icono de CodeQL en la barra de actividad. Aparecen varias vistas; estas son
las que vas a usar:

| Vista | Para qué |
|---|---|
| **Databases** | Las bases que tienes cargadas. Aquí eliges sobre cuál corren las consultas. |
| **Queries** | Las consultas de tu espacio de trabajo, con un botón para correr cada una. |
| **Query History** | Cada ejecución de esta sesión. Clic para volver a ver sus resultados. |
| **Variant Analysis** | Correr una consulta contra muchos repos de GitHub. No la usas aquí. |

Y dos que aparecen al ejecutar: **Results** (los hallazgos) y **Compare** (diferencia
entre dos ejecuciones).

---

## 3. Tu primera base de datos

**Lo que la extensión NO hace:** crear la base desde el código fuente. La opción *From a
folder* espera una carpeta que **ya es** una base de CodeQL, no tu carpeta de código. La
base se construye con el CLI, en el terminal.

En la raíz del repo:

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\codeql\codeql;$env:PATH"

codeql database create .codeql/bases/js `
  --language=javascript-typescript `
  --source-root=. `
  --overwrite
```

> **Antes de correrlo:** añade `.codeql/` a `.gitignore`. Una base de CodeQL guarda una
> copia comprimida del código fuente, y en este repo eso puede incluir
> `frontend/public/data/noticias.json` — prensa real. Está explicado en el
> [Módulo 1.3 del curso](CODEQL.md#13-dónde-viven-las-bases-de-datos).

Cuando termine, en VS Code: vista **Databases** → pasa el cursor por la barra de título de
la vista → icono **From a folder** → elige `.codeql/bases/js`.

Queda seleccionada (marcada) en la lista. Puedes cargar varias y elegir cuál está activa;
las consultas corren contra la seleccionada.

---

## 4. El pack de consultas: sin esto no hay autocompletado

Si abres un `.ql` suelto y escribes `import javascript`, el editor te subraya todo en rojo:
no sabe dónde está esa librería. La extensión resuelve las librerías a través de un
**pack**, no del archivo.

Crea `.codeql/consultas-js/qlpack.yml`:

```yaml
name: coipo/consultas-js
version: 0.1.0
dependencies:
  codeql/javascript-all: "*"
```

Y descarga las dependencias:

```powershell
codeql pack install .codeql/consultas-js
```

Ahora cualquier `.ql` que pongas **dentro de esa carpeta** tiene autocompletado, F12 a las
definiciones de la librería y errores de tipo en vivo. Un `.ql` fuera del pack, no. Es la
causa número uno de «la extensión no me funciona».

---

## 5. Quick Query: una consulta desechable en 30 segundos

Para probar algo sin crear archivos: `Ctrl+Shift+P` → **CodeQL: Quick Query**.

Te abre un buffer temporal ya conectado a la base activa y con los imports resueltos.
Escribe:

```ql
import javascript

from DataFlow::CallNode llamada
where llamada = DataFlow::globalVarRef("fetch").getACall()
select llamada, "llamada a fetch"
```

Y ejecútala: `Ctrl+Shift+P` → **CodeQL: Run Query on Selected Database**.

Debería devolver una sola fila, en `collector/src/adaptadores/fetch-seguro.js`. Clic en el
resultado y salta a la línea.

Quick Query es para tantear. Lo que quieras conservar, va en el pack del paso 4.

---

## 6. Ejecutar consultas del pack

Tres caminos, todos equivalentes:

- Vista **Queries**: pasa el cursor sobre la consulta y clic en el icono **Run local
  query**.
- Con el `.ql` abierto: `Ctrl+Shift+P` → **CodeQL: Run Query on Selected Database**.
- En el explorador de archivos: selecciona uno o varios `.ql`, clic derecho → **CodeQL:
  Run Queries in Selected Files**.

Y si cargaste varias bases: **CodeQL: Run Query on Multiple Databases**, que te deja
elegirlas de una lista.

---

## 7. Quick Evaluation: la habilidad que lo cambia todo

Esta es la razón de usar la extensión en vez del CLI. Lee esto dos veces.

**El problema.** Escribes una consulta de 30 líneas con tres predicados, la corres, y
devuelve cero filas. ¿Cuál de los tres está mal? Sin Quick Evaluation, adivinas.

**Cómo se usa.** Pon el cursor sobre el nombre de un predicado, una clase o incluso una
subexpresión, y `Ctrl+Shift+P` → **CodeQL: Quick Evaluation**. Evalúa **solo eso** y te
muestra todo lo que satisface.

**Pruébalo ahora,** con la consulta del [Módulo 6 del curso](CODEQL.md#62-la-consulta) —
la que marca rutas de escritura sin autorización. Antes de correrla entera, pon el cursor
sobre la clase `RutaFastApi` y haz Quick Evaluation:

- Si devuelve **0 filas**, el constructor de la clase está mal y toda la consulta es
  decorativa. Arréglalo antes de mirar nada más.
- Si devuelve **las rutas del repo**, la clase está bien y el problema está más abajo.

Después haz Quick Evaluation sobre `exigeAdmin()` solo. Y sobre `escribe()` solo. En tres
clics sabes exactamente qué predicado falla, en vez de mirar 30 líneas.

**La regla:** nunca escribas una consulta entera y la depures al final. Construye un
predicado, evalúalo, construye el siguiente.

---

## 8. View AST: cómo saber qué clase escribir

La otra pregunta constante del principiante: *«esto que veo en el código, ¿qué clase de
CodeQL es?»*.

1. En la vista **Databases**, expande tu base y abre un archivo del código fuente — por
   ejemplo `collector/src/adaptadores/fetch-seguro.js`. Importante: ábrelo **desde la
   base**, no desde el explorador de archivos, o el comando no tiene contexto.
2. Con ese archivo activo: `Ctrl+Shift+P` → **CodeQL: View AST**.

Se abre un árbol donde cada nodo trae el **nombre de la clase de CodeQL** que le
corresponde. Clic en un nodo y se resalta el código; clic en el código y se resalta el
nodo.

Busca la línea `const respuesta = await fetch(url, …)` y sigue el árbol hasta la llamada.
Ahí ves, escrito, qué clase tienes que nombrar en tu `from`. Es la forma rápida de
aprender la librería de un lenguaje que no conoces — y te va a hacer falta en el
[Módulo 5](CODEQL.md#módulo-5--python-el-backend-fastapi), donde las clases de Python no
se llaman como las de JavaScript.

---

## 9. Leer los resultados

La vista **Results** cambia según el `@kind` de la consulta:

- **Sin metadatos** (`select` a secas): tabla cruda, una columna por cada cosa que
  seleccionaste.
- **`@kind problem`**: lista de alertas con su mensaje. Es lo que verías en la pestaña
  Security de GitHub.
- **`@kind path-problem`**: además de la alerta, el **camino completo** del dato. Se
  despliega paso a paso, y cada paso salta a su línea. Para el
  [SSRF del Módulo 4](CODEQL.md#43-tu-configuración-de-taint) esto es la diferencia entre
  «hay un hallazgo» y «entiendo por dónde viaja la URL».

Arriba de la tabla hay un selector para alternar entre **Alerts** y los resultados crudos
(`#select`). Cuando una consulta de alertas te dé algo raro, mira el crudo.

**Comparar dos ejecuciones.** En **Query History**, clic derecho sobre una ejecución →
comparar con otra. Te muestra qué resultados aparecieron y cuáles desaparecieron. Es lo
que usas al afinar una consulta: cambias un predicado, corres, comparas, y ves
exactamente qué te llevaste por delante.

---

## 10. El panel Testing

La extensión se registra en la vista **Testing** de VS Code (el icono del matraz). Ahí
aparecen automáticamente todos los tests de consultas de tu espacio de trabajo.

- Botón de *play* sobre un archivo o carpeta: corre ese test.
- Botón de *play* arriba del todo: corre todos.
- Botón de *stop*: cancela si se alarga.

Para el detalle de por qué falló un test, abre el log **CodeQL Tests** en Output.

Esto es la contraparte visual del [Módulo 7 del curso](CODEQL.md#módulo-7--probar-las-consultas-codeql-test).
Escribir el test en el módulo 7 y correrlo desde este panel es el ciclo completo.

---

## 11. Cuando algo va mal

| Síntoma | Qué hacer |
|---|---|
| `Could not find CodeQL on path` | El paso 1 no quedó. Revisa `codeQL.cli.executablePath` y recarga la ventana. |
| Todo subrayado en rojo en un `.ql` | El archivo está fuera del pack, o falta `codeql pack install`. Paso 4. |
| La consulta devuelve 0 y no entiendes por qué | Quick Evaluation predicado por predicado. Paso 7. |
| Los tiempos no cuadran al comparar rendimiento | `CodeQL: Clear Cache` antes de cada corrida: el servidor cachea predicados. |
| Quieres ver dónde se va el tiempo | Activa el ajuste **Running Queries: Debug** y mira el tab **Query Server** en Output. |
| La consulta se queda sin memoria | Sube el ajuste **Running Queries: Memory**. |
| Cambiaste el código y la consulta no lo ve | Normal: la base es una foto. Reconstrúyela con `codeql database create … --overwrite`. |

Los dos logs que importan, en **Output** (`Ctrl+Shift+U`): **CodeQL Extension** (arranque,
CLI, packs) y **Query Server** (evaluación de consultas).

---

## 12. Ejercicio guiado, de punta a punta

Unos 20 minutos, y al terminar has usado todo lo anterior.

1. Deja el CLI funcionando (paso 1) y confirma con `codeql --version`.
2. Construye la base de JavaScript (paso 3) y añádela a la vista **Databases**.
3. Crea el pack y corre `codeql pack install` (paso 4).
4. **Quick Query** con la consulta de `fetch` del paso 5. Confirma que sale una sola fila.
5. Abre `fetch-seguro.js` **desde la base** y hazle **View AST** (paso 8). Encuentra el
   nodo de la llamada a `fetch` y anota qué clase es.
6. Guarda la consulta como `.codeql/consultas-js/perimetro-red.ql`, con los metadatos y el
   filtro del [Módulo 3](CODEQL.md#31-la-consulta). Córrela: debe dar **cero filas**.
7. Añade a mano la evasión `globalThis.fetch(url)` en `fuente-rss.js`, **reconstruye la
   base**, y vuelve a correr. Ahora debe dar una. Compara las dos ejecuciones en **Query
   History** (paso 9).
8. Borra la evasión.

Si el paso 7 te da una fila y el test de vitest sigue verde, entendiste para qué sirve
todo esto.
