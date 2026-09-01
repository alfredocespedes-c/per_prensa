# Curso de CodeQL sobre COIPO_PRENSA

Curso práctico de CodeQL usando **este** repositorio como material. No hay ejemplos de
juguete: cada consulta que vas a escribir persigue una propiedad que este código ya
declara en `CLAUDE.md` y que hoy vigila —cuando la vigila— con expresiones regulares.

**Antes de empezar, dos advertencias honestas:**

1. **Este repositorio es privado** (`api.github.com/repos/Sud-Austral/coipo_prensa2`
   devuelve 404 sin autenticar). El *code scanning* de GitHub con CodeQL es gratis en
   repos **públicos**; en privados exige **GitHub Advanced Security / Code Security**,
   que se paga por *active committer*. Eso choca de frente con la decisión de alcance #2
   (presupuesto $0). Ver [Módulo 0](#módulo-0--decidir-antes-de-instalar-nada).
2. **Las consultas de este documento no se ejecutaron.** El CLI de CodeQL no está
   instalado en esta máquina. Están escritas contra la API actual de la librería
   estándar, pero los nombres de predicados cambian entre versiones. El
   [Módulo 7](#módulo-7--probar-las-consultas-codeql-test) te enseña a **testear
   consultas**, y ahí es donde las validas. Trátalas como código que tú vas a hacer
   compilar, no como código dado por bueno.

| Módulo | Tema | Tiempo |
|---|---|---|
| 0 | Decidir antes de instalar nada | 20 min |
| 1 | Instalar y crear la primera base de datos | 45 min |
| 2 | Primeras consultas QL | 1 h |
| 3 | Reescribir la guarda de perímetro de red | 1,5 h |
| 4 | Taint tracking: el SSRF real del collector | 2 h |
| 5 | Python: el backend FastAPI | 1,5 h |
| 6 | Consulta de arquitectura: quién puede escribir | 2 h |
| 7 | Probar las consultas (`codeql test`) | 1 h |
| 8 | Integrar en CI | 1 h |
| 9 | Qué NO hace CodeQL | 20 min |

---

## Módulo 0 — Decidir antes de instalar nada

### Qué es CodeQL, en una frase

CodeQL **convierte el código fuente en una base de datos relacional** y te deja
consultarla con un lenguaje declarativo (QL, emparentado con Datalog). No busca texto:
busca hechos sobre el árbol sintáctico, la tabla de símbolos y el grafo de flujo de
datos. «Encuentra las llamadas a `fetch`» deja de ser una expresión regular y pasa a ser
una consulta sobre nodos.

### Por qué a *este* repositorio le calza

Este repo ya inventó CodeQL a mano, en pequeño. Mira
[collector/test/perimetro-red.test.js](../collector/test/perimetro-red.test.js): no
prueba una función, prueba **una propiedad del árbol de código** («nadie llama a `fetch`
fuera de `fetch-seguro.js`»). Lo mismo
[frontend/src/sin-exportacion.test.js](../frontend/src/sin-exportacion.test.js)
(decisión #9) y [collector/test/contrato-estado.test.js](../collector/test/contrato-estado.test.js)
(decisión #8).

Son buenas guardas. Y son de texto, así que tienen agujeros. Este es real:

```js
// La guarda usa: /(^|[^.\w])fetch\s*\(/
globalThis.fetch(url)        // el carácter previo es '.', excluido por [^.\w] → NO la ve
const pedir = fetch          // 'fetch' no va seguido de '(' → NO la ve
pedir(url)                   // 'pedir' no es 'fetch' → NO la ve
```

Cualquiera de esas dos líneas en `fuente-rss.js` deja la suite en verde y el respeto de
`robots.txt` sin ocurrir — exactamente el fallo que el comentario del test dice que ya
pasó una vez. CodeQL cierra los dos casos porque sigue el **alias**, no el texto. En el
[Módulo 3](#módulo-3--reescribir-la-guarda-de-perímetro-de-red) lo demuestras tú.

### La decisión de costo, que es tuya y no técnica

| Camino | Costo | Estado |
|---|---|---|
| CLI local + extensión de VS Code, sobre este código | $0 | **Disponible hoy** (módulos 1–7); el código es MIT, ver la nota de licencia |
| Code scanning en GitHub (pestaña Security, anotaciones en PR) | Requiere GHAS en repo privado | **Bloqueado** por decisión #2 — y es un bloqueo *técnico*, no de licencia |
| Hacer público el repo → code scanning gratis y cero ambigüedad | $0 | **Bloqueado** por decisión #11 (`INSUMO/`) |

Fíjate en la tercera fila: la decisión #11 de `CLAUDE.md` dice que el repositorio está
*pensado para publicarse* y que lo único que lo impide es `INSUMO/` versionado con prensa
real y el historial sin purgar. Sacar eso adelante no solo cierra una deuda de
privacidad: **desbloquea CodeQL gratis en CI** y disuelve la duda de licencia que sigue.
Es un argumento más para esa tarea.

### La licencia del CLI, con el texto delante

Los *GitHub CodeQL Terms and Conditions* (`github/codeql-cli-binaries/LICENSE.md`)
definen:

> **Open Source Codebase:** «A codebase that is released under an OSI-approved License.»

Permiten, entre otras cosas:

> «Perform analysis on the Open Source Codebase.»
>
> «If the Open Source Codebase is hosted and maintained on GitHub.com, generate CodeQL
> databases for or during automated analysis, CI, or CD.»
>
> «Use the Software to perform academic research.»

Y prohíben:

> «…use the Software in connection with any codebase that is not an Open Source Codebase
> (e.g., code in a private repo in GitHub).»

**Dónde cae COIPO_PRENSA.** El repositorio tiene [`LICENSE`](../LICENSE) con **MIT**
—licencia aprobada por la OSI— y el README lo declara en su sección *Licencia*. La
definición de los términos habla del **código y de la licencia bajo la que se publica**,
no de la visibilidad del repositorio, y el permiso «Perform analysis on the Open Source
Codebase» no lleva condición de hosting adosada. Con eso, correr el CLI en local sobre
este código está dentro de los términos.

Lo que queda de duda es una palabra: *released*. Un repositorio que nadie de fuera puede
ver, ¿está «released» bajo MIT? Y el ejemplo entre paréntesis de la prohibición
—«e.g., code in a private repo in GitHub»— muestra que GitHub, en la práctica, lee
«privado» como «no open source». No es una pregunta técnica y este documento no la
resuelve.

**Lo que sí es seguro en las dos lecturas:** publicar el repositorio elimina la
ambigüedad de un plumazo. Mientras tanto, si quieres cero riesgo, los módulos 1, 2 y 7
—instalar, aprender QL, testear consultas— se practican igual de bien contra cualquier
repo con licencia OSI.

Si la respuesta termina siendo «no podemos licenciarlo», las alternativas gratuitas y sin
ambigüedad son **Semgrep OSS** (reglas estructurales, muy parecido a los módulos 3 y 6) y
**Bandit** para Python. Pierdes el *taint tracking* interprocedural del Módulo 4, que es
justamente lo que ninguna de las dos hace bien.

---

## Módulo 1 — Instalar y crear la primera base de datos

> **El manejo de la extensión tiene su propia guía:**
> [CODEQL-VSCODE.md](CODEQL-VSCODE.md) — instalación desbloqueada, las vistas de la barra
> lateral, Quick Evaluation, View AST, el panel Testing y qué hacer cuando falla.

### 1.1 El CLI

Descarga el **bundle**, no el CLI pelado: el bundle trae el CLI *más* los packs de
consultas estándar ya compilados, y te ahorra la primera pelea.

**Excepción por espacio en disco:** si vas justo de disco (menos de ~10 GB libres), baja
`codeql-win64.zip` en vez del bundle y deja que los packs se descarguen a demanda. Ver
[CODEQL-VSCODE.md §0](CODEQL-VSCODE.md#0-dos-cosas-de-tu-máquina-antes-de-empezar).

- Página: `https://github.com/github/codeql-action/releases` → archivo
  `codeql-bundle-win64.tar.gz`.

Extráelo siguiendo la convención que ya usas para Node portable:

```powershell
# Descomprimir en C:\Users\luis.monsalve\AppData\Local\Programs\codeql
$destino = "$env:LOCALAPPDATA\Programs\codeql"
New-Item -ItemType Directory -Force $destino
tar -xzf .\codeql-bundle-win64.tar.gz -C $destino
```

Añádelo al PATH **por sesión** (igual que Node portable, sin tocar el PATH global):

```powershell
$env:PATH = "$env:LOCALAPPDATA\Programs\codeql\codeql;$env:PATH"
codeql --version
codeql resolve languages
codeql resolve qlpacks
```

`resolve languages` debe listar `javascript-typescript` y `python`. `resolve qlpacks`
debe mostrar `codeql/javascript-queries` y `codeql/python-queries`; si el bundle está
bien, ya vienen.

### 1.2 La extensión de VS Code

Instala **CodeQL** (publicada por GitHub). En sus ajustes, apunta
`codeQL.cli.executablePath` al `codeql.exe` que acabas de extraer.

Esta extensión no es un lujo: sin autocompletado y sin «ir a la definición» dentro de los
`.qll` de la librería estándar, escribir QL es adivinar nombres de predicados. El
[Módulo 2](#22-la-habilidad-central-quick-evaluation) depende de una de sus funciones.

**¿La extensión necesita un repositorio público?** No. Funciona **entera en local**:
apunta al CLI, abre una base que tú creaste desde una carpeta y ejecuta consultas sin
tocar la red y sin pedirte una cuenta de GitHub. Lo que discute el Módulo 0 es el *code
scanning* de GitHub —la pestaña Security y las anotaciones en PR—, que es otra cosa; y la
licencia, que aplica al CLI, no a la extensión.

La única función de la extensión que sí necesita GitHub es **MRVA** (*multi-repository
variant analysis*): correr tu consulta contra hasta 1.000 repositorios a la vez. Exige un
*controller repository* —puede ser público si solo analizas repos públicos, y **debe** ser
privado si necesitas analizar alguno privado— y que los repos objetivo tengan code
scanning con CodeQL habilitado, lo que en privados vuelve a pedir GHAS. No la usas en este
curso.

### 1.3 Dónde viven las bases de datos

Una base de datos de CodeQL **contiene una copia comprimida del código fuente**
(`src.zip`). En este repositorio eso importa más que en otros: si construyes una base
después de una corrida real del collector, `frontend/public/data/noticias.json` —prensa
real, gitignoreada— **queda dentro de la base**. Nunca la versiones.

```powershell
# Añade a .gitignore, antes de crear nada:
Add-Content .gitignore "`n# Bases de datos de CodeQL (contienen copia del fuente)`n.codeql/"
```

### 1.4 Crear las dos bases

JavaScript y Python son lenguajes *sin compilación*: CodeQL los extrae leyendo archivos,
no observando un build. Las dos de una vez:

```powershell
codeql database create .codeql/bases `
  --db-cluster `
  --language=javascript-typescript,python `
  --source-root=. `
  --overwrite
```

Eso deja `.codeql/bases/javascript-typescript` y `.codeql/bases/python`. Tarda unos
minutos: el extractor de JS recorre `collector/src` (5.356 líneas), `frontend/src`
(6.071) y `scripts/`; el de Python, `backend/app` (2.754).

Si aparece ruido de `node_modules`, crea `.github/codeql/config.yml`:

```yaml
paths-ignore:
  - '**/node_modules'
  - '**/dist'
  - 'frontend/public/geo'   # 310 KB de GeoJSON generado, no es código
```

y pásalo con `--codescanning-config=.github/codeql/config.yml`. El mismo archivo lo
reutiliza el CI en el [Módulo 8](#módulo-8--integrar-en-ci).

### 1.5 Primer análisis, sin escribir nada todavía

```powershell
codeql database analyze .codeql/bases/javascript-typescript `
  codeql/javascript-queries:codeql-suites/javascript-security-extended.qls `
  --format=csv --output=.codeql/js.csv --download
```

```powershell
codeql database analyze .codeql/bases/python `
  codeql/python-queries:codeql-suites/python-security-and-quality.qls `
  --format=csv --output=.codeql/py.csv --download
```

Las suites, de menos a más ruidosa:

| Suite | Qué trae |
|---|---|
| `…-code-scanning.qls` | lo que GitHub corre por defecto: alta precisión |
| `…-security-extended.qls` | añade consultas de menor precisión, más cobertura |
| `…-security-and-quality.qls` | añade calidad de código (no solo seguridad) |

**Ejercicio 1.** Abre `.codeql/py.csv`. Busca si `py/sql-injection` marcó
[backend/app/db/bootstrap.py:39](../backend/app/db/bootstrap.py#L39):

```python
connection.exec_driver_sql(f"SELECT pg_advisory_lock({CANDADO_ESQUEMA})")
```

Es una f-string interpolada dentro de SQL crudo. ¿La marcó? Casi seguro que **no**, y esa
es la lección: las consultas de seguridad de CodeQL son de **taint tracking**, no de
patrón. `CANDADO_ESQUEMA` es una constante de módulo, no llega desde una petición HTTP,
así que no hay flujo desde una fuente no confiable y la consulta calla. Eso es correcto y
es lo que la hace usable. Si tú quieres prohibir la *forma* («ninguna f-string en SQL,
constante o no»), eso es una **consulta de política** y la escribes tú — Módulo 5.

---

## Módulo 2 — Primeras consultas QL

### 2.1 Estructura mínima

Crea un pack propio para tus consultas de JS:

```
.codeql/consultas-js/
  qlpack.yml
  hola.ql
```

`qlpack.yml`:

```yaml
name: coipo/consultas-js
version: 0.1.0
dependencies:
  codeql/javascript-all: "*"
```

```powershell
codeql pack install .codeql/consultas-js
```

`hola.ql`:

```ql
import javascript

from File f
where f.getRelativePath().matches("collector/src/dominio/%")
select f.getRelativePath()
```

```powershell
codeql query run .codeql/consultas-js/hola.ql `
  --database=.codeql/bases/javascript-typescript
```

Debe listar los ~19 archivos de `collector/src/dominio/`. Un `.ql` es siempre lo mismo:
`import` de la librería del lenguaje, `from` que declara variables tipadas, `where` que
las restringe y `select` que proyecta el resultado. No hay orden de ejecución: describes
qué es verdad, el motor resuelve.

### 2.2 La habilidad central: *quick evaluation*

Esto es lo que separa escribir QL de sufrirlo. En VS Code, pon el cursor sobre cualquier
predicado o clase de tu consulta, botón derecho → **CodeQL: Quick Evaluation**. Evalúa
**solo ese predicado** contra la base y te muestra su extensión completa.

Úsalo para todo: cuando no sepas si `getRelativePath()` devuelve barras o contrabarras,
evalúalo. Cuando no sepas si tu clase `RutaFastApi` captura las 8 rutas o solo 3,
evalúala. Escribir la consulta entera y depurarla al final es la forma lenta.

La otra mitad: **F12 sobre cualquier nombre de la librería estándar** te lleva al `.qll`
donde está definido, con su documentación. Ahí resuelves las dudas de nombres de
predicados que este documento no puede resolverte, porque dependen de tu versión.

### 2.3 Ejercicios de calentamiento

**Ejercicio 2.1.** Lista todas las funciones exportadas de `collector/src/dominio/`.
Pista: `Function`, y `getRelativePath()`.

**Ejercicio 2.2.** Encuentra todas las llamadas a `fetch` del repositorio:

```ql
import javascript

from DataFlow::CallNode llamada
where llamada = DataFlow::globalVarRef("fetch").getACall()
select llamada, "llamada a fetch"
```

Compara el resultado con lo que dice
[perimetro-red.test.js](../collector/test/perimetro-red.test.js): debería salir
únicamente `collector/src/adaptadores/fetch-seguro.js:68`. Fíjate en lo que acabas de
escribir: `globalVarRef("fetch")` devuelve el nodo del **símbolo global**, y `.getACall()`
recorre sus usos locales. No es una búsqueda de la palabra «fetch».

**Ejercicio 2.3.** El transporte por defecto de las pruebas herméticas menciona `fetch`
sin invocarlo (`transporte: fetch` en `fuente-rss.js`). El test de texto necesitó un caso
dedicado para no confundirlo. ¿Tu consulta lo confundió? ¿Por qué no?

---

## Módulo 3 — Reescribir la guarda de perímetro de red

Objetivo: convertir [perimetro-red.test.js](../collector/test/perimetro-red.test.js) en
una consulta semántica, y **demostrar** que atrapa lo que la regex no.

### 3.1 La consulta

`.codeql/consultas-js/perimetro-red.ql`:

```ql
/**
 * @name Llamada a fetch fuera del perímetro de red
 * @description Todo lo que sale a la red debe pasar por cliente-http.js →
 *              fetch-seguro.js, que consulta robots.txt y espera el Crawl-delay antes
 *              de pedir. Un fetch directo salta esa comprobación en silencio.
 * @kind problem
 * @problem.severity error
 * @precision very-high
 * @id coipo/js/fetch-fuera-del-perimetro
 * @tags security maintainability
 */

import javascript

/** El único archivo autorizado a invocar fetch (decisión de alcance #7). */
predicate esPuntoUnico(File f) {
  f.getRelativePath() = "collector/src/adaptadores/fetch-seguro.js"
}

from DataFlow::CallNode llamada
where
  llamada = DataFlow::globalVarRef("fetch").getACall() and
  llamada.getFile().getRelativePath().matches("collector/src/%") and
  not esPuntoUnico(llamada.getFile())
select llamada,
  "Esta llamada a fetch evita cliente-http.js: no consulta robots.txt ni respeta Crawl-delay."
```

Sobre el árbol limpio debe devolver **cero filas**. Igual que el test.

### 3.2 La demostración (esta es la parte importante)

Añade temporalmente a `collector/src/adaptadores/fuente-rss.js`:

```js
export async function evasion(url) {
  return globalThis.fetch(url)
}
```

Ahora:

```powershell
cd collector; npm test -- perimetro-red    # ← VERDE. No lo ve.
cd ..
codeql database create .codeql/bases/javascript-typescript `
  --language=javascript-typescript --source-root=. --overwrite
codeql query run .codeql/consultas-js/perimetro-red.ql `
  --database=.codeql/bases/javascript-typescript    # ← 1 fila.
```

Repite con la segunda evasión:

```js
const pedir = fetch
export async function evasion2(url) {
  return pedir(url)
}
```

Mismo resultado: el test de texto en verde, CodeQL en rojo. `getACall()` sigue el alias
local porque trabaja sobre el grafo de flujo, no sobre la línea.

**Borra las dos evasiones antes de seguir.** (Y fíjate en el precio: tuviste que
**reconstruir la base** para ver el cambio. CodeQL analiza una foto, no el archivo vivo.
Eso lo hace magnífico en CI y torpe como linter de escritorio; oxlint y vitest siguen
siendo los que corren en cada guardado.)

### 3.3 Ejercicio

**Ejercicio 3.** Traduce la decisión #9 —sin exportación masiva— a CodeQL.
[sin-exportacion.test.js](../frontend/src/sin-exportacion.test.js) busca `text/csv`,
`new Blob(`, `URL.createObjectURL`, un atributo `download` y `BotonCSV`. Escribe
`sin-exportacion.ql` que cubra al menos `new Blob(...)` y `URL.createObjectURL(...)` en
`frontend/src/`.

<details>
<summary>Solución</summary>

```ql
import javascript

from DataFlow::Node hallazgo, string motivo
where
  hallazgo.getFile().getRelativePath().matches("frontend/src/%") and
  (
    hallazgo = DataFlow::globalVarRef("Blob").getAnInstantiation() and
    motivo = "new Blob(): construcción de archivo para descarga"
    or
    hallazgo = DataFlow::globalVarRef("URL").getAPropertyRead("createObjectURL").getACall() and
    motivo = "URL.createObjectURL(): enlace de descarga"
  )
select hallazgo, "Decisión de alcance #9 (sin exportación masiva): " + motivo
```

Nota la ganancia sobre la regex: esto también atrapa
`const B = Blob; new B(...)`, y no se dispara con la palabra «Blob» dentro de un
comentario o de un string.
</details>

---

## Módulo 4 — Taint tracking: el SSRF real del collector

Aquí CodeQL hace lo que ninguna búsqueda estructural puede: seguir un valor **a través de
funciones y archivos**.

### 4.1 El problema, tal como está documentado

[fetch-seguro.js](../collector/src/adaptadores/fetch-seguro.js) abre diciéndolo: el
collector descarga URLs que vienen de fuentes **no confiables** —el `<link>` de un RSS,
el `<loc>` de un sitemap, la URL resuelta desde Google News— y es el único componente con
línea de vista a la red interna. Una de esas URLs podría apuntar a `169.254.169.254`.
`fetchSeguro` valida esquema, valida host contra rangos privados, y revalida en **cada
redirección**.

En vocabulario de CodeQL: hay una **fuente** (el feed de un tercero), un **sumidero**
(`fetch`) y un **saneador** (`fetchSeguro`). Un análisis de taint es exactamente eso.

### 4.2 Primero, la consulta que ya existe

```powershell
codeql database analyze .codeql/bases/javascript-typescript `
  codeql/javascript-queries:Security/CWE-918/RequestForgery.ql `
  --format=csv --output=.codeql/ssrf.csv --download
```

Es `js/request-forgery`. Probablemente devuelva poco o nada, porque las fuentes que
modela son las estándar (parámetros de una petición HTTP entrante) y aquí la fuente es
**un feed XML que el collector fue a buscar**. CodeQL no sabe que eso es no confiable
hasta que se lo dices. Ese es el trabajo de un analista, y es el siguiente paso.

### 4.3 Tu configuración de taint

`.codeql/consultas-js/ssrf-collector.ql`:

```ql
/**
 * @name URL de tercero llega a la red sin pasar por fetchSeguro
 * @description Los <link> de RSS y los <loc> de sitemaps son texto de un tercero. Si
 *              alcanzan fetch sin validación de host, el collector puede ser dirigido
 *              a la red interna (CWE-918).
 * @kind path-problem
 * @problem.severity error
 * @security-severity 8.6
 * @precision medium
 * @id coipo/js/ssrf-collector
 * @tags security external/cwe/cwe-918
 */

import javascript

module ConfiguracionSsrf implements DataFlow::ConfigSig {
  /** Lo que devuelve un parser de feed o de sitemap es dato de un tercero. */
  predicate isSource(DataFlow::Node origen) {
    exists(DataFlow::CallNode parse |
      parse.getCalleeName() = ["parseFeed", "parseStringPromise", "parseSitemap"] and
      origen = parse
    )
  }

  /** El primer argumento de fetch: la URL que se va a pedir. */
  predicate isSink(DataFlow::Node destino) {
    exists(DataFlow::CallNode f |
      f = DataFlow::globalVarRef("fetch").getACall() and
      destino = f.getArgument(0)
    )
  }

  /** fetchSeguro valida esquema y host antes de conectar: corta el flujo. */
  predicate isBarrier(DataFlow::Node nodo) {
    exists(DataFlow::CallNode validacion |
      validacion.getCalleeName() = ["esUrlHttp", "hostPermitido"] and
      nodo = validacion.getArgument(0)
    )
  }
}

module FlujoSsrf = TaintTracking::Global<ConfiguracionSsrf>;

import FlujoSsrf::PathGraph

from FlujoSsrf::PathNode origen, FlujoSsrf::PathNode destino
where FlujoSsrf::flowPath(origen, destino)
select destino.getNode(), origen, destino,
  "Esta URL viene de $@ y llega a fetch sin pasar por fetchSeguro.", origen.getNode(), "un feed de tercero"
```

Tres cosas que aprender de aquí:

- **`@kind path-problem`** en vez de `problem`. Cambia la salida: en lugar de un punto, te
  entrega el **camino completo** del dato, nodo por nodo. En VS Code se navega. Es la
  diferencia entre «hay un bug» y «aquí está la ruta, revísala».
- **`TaintTracking::Global<Config>` vs `DataFlow::Global<Config>`.** Taint sigue el valor
  aunque se transforme (concatenación, `String()`, `.trim()`); dataflow puro exige que sea
  *el mismo* valor. Para URLs siempre quieres taint.
- **`isBarrier` es donde vive tu criterio.** Estás afirmando que `esUrlHttp` /
  `hostPermitido` sanean de verdad. Si esa afirmación es falsa, la consulta calla y tú
  duermes tranquilo sin motivo. Un barrier mal puesto no produce un falso positivo:
  produce un **falso negativo**, que es el error caro.

### 4.4 Ejercicio

**Ejercicio 4.** El propio `fetch-seguro.js` documenta un residual: *DNS-rebinding*, un
host que resuelve a IP pública en la validación y a IP privada al conectar. ¿Puede CodeQL
detectarlo? Argumenta la respuesta.

<details>
<summary>Solución</summary>

No, y entender por qué vale más que la consulta. El defecto no está en el flujo de datos:
`hostPermitido(host)` y `fetch(url)` reciben el host correcto, y el grafo está limpio. El
defecto es **temporal** — dos resoluciones DNS distintas en dos momentos distintos— y vive
fuera del programa, en la red. CodeQL razona sobre el código, no sobre el mundo.

Lo más cerca que puedes llegar es una consulta de política: «marca todo `dns.lookup`
cuyo resultado no se use en la conexión posterior», es decir, detectar la *forma* TOCTOU.
Es un ejercicio legítimo y difícil. Pero el arreglo real es fijar la IP resuelta en la
conexión, y eso ninguna consulta lo va a encontrar por ti.
</details>

---

## Módulo 5 — Python: el backend FastAPI

### 5.1 Lo mismo, con otra librería

```ql
import python

from Function f
where f.getLocation().getFile().getRelativePath().matches("backend/app/routers/%")
select f.getName()
```

`import python` en vez de `import javascript`. Las clases cambian (`Function`, `Call`,
`Attribute`, `Name`), la mecánica no. Aquí `Quick Evaluation` te salva de nuevo: los
nombres de la librería de Python **no** son los de la de JS.

### 5.2 SQL: lo que CodeQL sí ve y lo que no

Este repositorio tiene los dos casos, a pocas líneas uno de otro.

**Parametrizado, correcto** —
[backend/app/routers/conceptos.py:385-396](../backend/app/routers/conceptos.py#L385-L396):

```python
titulares = db.execute(
    text("""
        SELECT id, url, titular, medio_nombre, fecha
        FROM noticias
        WHERE excluida AND :concepto = ANY(excluida_por)
        ORDER BY fecha DESC NULLS LAST
        LIMIT :limite
    """),
    {"concepto": concepto, "limite": LIMITE_TITULARES},
).mappings().all()
```

`concepto` **sí** viene del cliente (es un query param de la ruta), pero viaja como
*binding* `:concepto`, no concatenado. CodeQL lo sigue hasta ahí y se detiene: no hay
inyección. Correcto.

**Interpolado, pero no explotable** —
[backend/app/db/bootstrap.py:39](../backend/app/db/bootstrap.py#L39):

```python
connection.exec_driver_sql(f"SELECT pg_advisory_lock({CANDADO_ESQUEMA})")
```

Una f-string dentro de SQL crudo. `py/sql-injection` no la marca porque `CANDADO_ESQUEMA`
es una constante de módulo: no hay fuente no confiable, no hay taint. Y es cierto: hoy no
es explotable.

**Ejercicio 5.1.** Escribe una **consulta de política** que marque *cualquier* f-string
que llegue a `text()`, `exec_driver_sql()` o `.query()` —haya taint o no— dentro de
`backend/`. Es deliberadamente más ruidosa que la de seguridad. La pregunta que debes
responderte al final: ¿la quieres en CI? Un `ALTER` desnudo en el DDL o un `pg_advisory_lock`
son hoy inocentes; el argumento a favor es que la próxima f-string quizá no lo sea, y el
argumento en contra es que una consulta que siempre marca lo mismo se acaba ignorando.

### 5.3 El equivalente Python del Módulo 4

**Ejercicio 5.2.** Corre `python-security-extended` y revisa
[backend/app/servicios/iam.py](../backend/app/servicios/iam.py) y
[backend/app/routers/auth.py](../backend/app/routers/auth.py) — el flujo OAuth del BFF.
Presta atención a `py/url-redirection` (¿el parámetro de retorno tras el login está
validado?) y a `py/clear-text-logging-sensitive-data` (¿algún token entra a un `logger`?).
Estos dos son de los pocos hallazgos de suite estándar que, en una app con login, suelen
ser reales.

---

## Módulo 6 — Consulta de arquitectura: quién puede escribir

Este es el módulo donde CodeQL deja de ser un buscador de vulnerabilidades y pasa a ser
**el guardián de una decisión de diseño**. Es, con diferencia, lo más valioso para este
repositorio.

### 6.1 El invariante

Decisión de alcance #5: hay dos roles, `general` y `admin`. Y hay una regla que ningún
test comprueba hoy: **toda ruta que escribe exige `requerir_admin_escritura`**, con **una
sola excepción documentada** — el `POST /api/retiros` público, porque, como dice
[retiros.py](../backend/app/routers/retiros.py), *«exigirle una cuenta en COIPO IAM al
dueño del contenido convertiría el derecho en un trámite inaccesible»*.

Esa regla vive hoy en la cabeza de quien revisa el PR. Una ruta `@router.patch` nueva sin
el `Depends` pasa todos los tests, pasa oxlint, pasa pip-audit y se despliega.

### 6.2 La consulta

`.codeql/consultas-py/rutas-sin-autorizacion.ql`:

```ql
/**
 * @name Ruta de escritura sin requerir_admin_escritura
 * @description Decisión de alcance #5: solo un admin escribe. La única excepción
 *              deliberada es POST /api/retiros (formulario público de retiro).
 * @kind problem
 * @problem.severity error
 * @precision high
 * @id coipo/py/ruta-escritura-sin-autz
 * @tags security access-control
 */

import python

/** Una función decorada con @router.<verbo>(...) */
class RutaFastApi extends Function {
  string verbo;

  RutaFastApi() {
    exists(Call decorador, Attribute atributo |
      decorador = this.getADecorator() and
      atributo = decorador.getFunc() and
      verbo = atributo.getName() and
      verbo in ["get", "post", "put", "patch", "delete"]
    )
  }

  string getVerbo() { result = verbo }

  predicate escribe() { verbo in ["post", "put", "patch", "delete"] }

  /** ¿Algún parámetro tiene por defecto Depends(requerir_admin_escritura)? */
  predicate exigeAdmin() {
    exists(Call dep |
      dep = this.getAnArg().(Parameter).getDefault() and
      dep.getFunc().(Name).getId() = "Depends" and
      dep.getArg(0).(Name).getId() = "requerir_admin_escritura"
    )
  }

  /** Excepción única y documentada: el formulario público de retiro. */
  predicate esExcepcionDeclarada() {
    this.getName() = "crear" and
    this.getLocation().getFile().getBaseName() = "retiros.py"
  }
}

from RutaFastApi ruta
where
  ruta.escribe() and
  not ruta.exigeAdmin() and
  not ruta.esExcepcionDeclarada()
select ruta,
  "Ruta " + ruta.getVerbo().toUpperCase() + " sin requerir_admin_escritura (decisión #5)."
```

**Esta consulta probablemente no compile a la primera.** `getADecorator()`, `getAnArg()`,
`Parameter.getDefault()`: los nombres exactos dependen de tu versión de la librería de
Python. Eso no es un defecto del ejercicio, es el ejercicio. Ponle Quick Evaluation a
`RutaFastApi` primero: si captura 0 rutas, arregla el constructor antes de tocar nada más.
F12 sobre `Function` te lleva al `.qll` con la lista de predicados reales.

### 6.3 Ejercicios

**Ejercicio 6.1.** Verifica que la consulta encuentra `crear` en `retiros.py` cuando
quitas la cláusula `esExcepcionDeclarada()`. Si no lo encuentra, la consulta es
decorativa — el mismo razonamiento del segundo caso de `perimetro-red.test.js`.

**Ejercicio 6.2 (proyecto final).** Decisión de alcance #6: el recorte público/interno
ocurre en `mapeo.py` (`CAMPOS_INTERNOS`) y **nunca** en React. Escribe una consulta que
marque cualquier router que construya su respuesta con `extracto`, `autor`, `analisis`,
`tono`, `entidades`, `regiones` o `eventos` **sin** pasar por la función de mapeo. Es
difícil y probablemente te salgan falsos positivos; la parte interesante es decidir dónde
poner el límite entre «detecta el fallo» y «nadie la ignora».

---

## Módulo 7 — Probar las consultas (`codeql test`)

Una consulta que nunca marca nada es indistinguible de una consulta rota. Este repo ya lo
sabe: `perimetro-red.test.js` tiene un caso llamado *«el detector encuentra una llamada
real (no es decorativo)»*. CodeQL trae el mismo mecanismo, integrado.

### 7.1 Estructura

```
.codeql/pruebas/perimetro-red/
  perimetro-red.qlref      → apunta a la consulta
  ejemplo.js               → el código de prueba
  perimetro-red.expected   → la salida esperada
```

`perimetro-red.qlref` (una línea, ruta dentro del pack):

```
perimetro-red.ql
```

`ejemplo.js` — casos positivos y negativos juntos, cada uno con su motivo:

```js
export async function directo(url) {
  return fetch(url)                 // $ Alert
}

export async function porGlobalThis(url) {
  return globalThis.fetch(url)      // $ Alert  ← la regex NO lo ve
}

export async function porAlias(url) {
  const pedir = fetch
  return pedir(url)                 // $ Alert  ← la regex NO lo ve
}

export function soloNombra() {
  return { transporte: fetch }      // sin alerta: nombra, no invoca
}
```

### 7.2 Correr y aceptar

```powershell
codeql test run .codeql/pruebas/perimetro-red --search-path=.codeql
```

La primera vez falla: `.expected` está vacío o no existe. Revisa la salida **a mano**, y
si es la correcta:

```powershell
codeql test accept .codeql/pruebas/perimetro-red
```

Eso escribe `.expected`. Desde ahí, cualquier cambio en la consulta que altere el
resultado hace fallar el test — igual que un snapshot de vitest.

**El paso que no debes saltarte:** revisa `.expected` línea por línea antes de aceptarlo.
`codeql test accept` graba *lo que la consulta hace*, no *lo que debería hacer*. Aceptar a
ciegas es la forma más eficiente de fijar un bug por escrito.

**Ejercicio 7.** Escribe la prueba del Módulo 6 (`rutas-sin-autorizacion`) con un
`ejemplo.py` que contenga: una ruta GET sin autz (no debe alertar), una PATCH sin autz
(debe alertar), una PATCH con autz (no debe alertar) y la excepción del formulario de
retiro (no debe alertar).

---

## Módulo 8 — Integrar en CI

**Este módulo está bloqueado por la decisión del Módulo 0** mientras el repositorio sea
privado y no haya licencia. Escríbelo igual: el día que se resuelva, está listo.

### 8.1 El workflow

`.github/workflows/codeql.yml`. Respeta las dos convenciones de este repo: **todo fijado a
SHA** y `permissions` mínimo por job.

```yaml
name: CodeQL

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    # Lunes 09:00 UTC. El análisis programado importa: las consultas de CodeQL se
    # actualizan, así que el mismo código puede tener un hallazgo nuevo sin haber
    # cambiado una línea.
    - cron: '0 9 * * 1'

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  analizar:
    name: CodeQL (${{ matrix.lenguaje }})
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      security-events: write   # imprescindible: subir el SARIF
      actions: read
    strategy:
      fail-fast: false
      matrix:
        lenguaje: [javascript-typescript, python, actions]
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
      - uses: github/codeql-action/init@<SHA>  # v3.x — resolver el SHA, ver abajo
        with:
          languages: ${{ matrix.lenguaje }}
          config-file: ./.github/codeql/config.yml
          queries: security-extended
      - uses: github/codeql-action/analyze@<SHA>  # mismo SHA que init
        with:
          category: "/language:${{ matrix.lenguaje }}"
```

Para resolver el SHA de una etiqueta, sin inventarlo:

```powershell
git ls-remote https://github.com/github/codeql-action "refs/tags/v3^{}"
```

Dependabot ya está configurado para `github-actions`
([.github/dependabot.yml](../.github/dependabot.yml)), así que mantendrá el pin al día
igual que hace con el resto.

### 8.2 El tercer lenguaje: `actions`

Fíjate en la matriz. CodeQL analiza **workflows de GitHub Actions** como lenguaje propio,
y este repositorio es justo su caso de uso: `ci.yml` llama a un *reusable workflow* de
otro repo (`Sud-Austral/infra-docker-base`) que despliega a un runner *self-hosted*.
CodeQL busca ahí inyección de expresiones `${{ }}` en `run:`, permisos excesivos y actions
sin fijar. Cuesta un job y cubre la superficie con peor relación riesgo/atención del repo.

### 8.3 Tus consultas propias en CI

`.github/codeql/config.yml`:

```yaml
paths-ignore:
  - '**/node_modules'
  - '**/dist'
  - 'frontend/public/geo'

queries:
  - uses: ./.codeql/consultas-js
  - uses: ./.codeql/consultas-py
```

Es decir: los módulos 3 y 6 corren en cada PR, junto a las consultas estándar.

### 8.4 ¿Compuerta de deploy?

El `deploy` de [ci.yml](../.github/workflows/ci.yml#L127) exige
`[collector, frontend, backend, docker, contenido]`. La tentación es añadir `analizar`.

Recomendación: **no de entrada.** Las consultas estándar traen falsos positivos, y un
deploy bloqueado por un hallazgo dudoso enseña a la gente a saltarse la compuerta, que es
peor que no tenerla. La progresión sensata:

1. **Semanas 1–2:** informativo. Los hallazgos aparecen en la pestaña Security, nadie se
   bloquea. Triaje: cada hallazgo se cierra como *fixed* o como *false positive con
   comentario*. Llegar a cero.
2. **Después:** entra a `needs`, pero solo tus consultas propias (`error`, escritas y
   testeadas por ti, precisión conocida) más los hallazgos `error` de la suite estándar.

Esa es exactamente la lógica que ya aplica `frontend/.audit-ci.jsonc`: bloquear de verdad,
con allowlist justificada.

---

## Módulo 9 — Qué NO hace CodeQL

Tan importante como lo anterior, porque una herramienta de seguridad genera una sensación
de cobertura que puede ser falsa.

| No detecta | Por qué | Qué lo cubre aquí |
|---|---|---|
| Prensa real versionada en `INSUMO/` | Es contenido, no código | `scripts/verificar-sin-contenido-de-prensa.mjs` |
| Que `robots.txt` se interprete mal | Semántica de dominio; el código es correcto | `collector/test/robots.test.js` |
| Que el extracto exceda 500 caracteres | Propiedad de runtime sobre datos | `largo-extracto.test.js` |
| Que el recorte público filtre un campo | Depende del valor en ejecución | `backend/tests/test_mapeo.py` |
| DNS-rebinding en `fetchSeguro` | Defecto temporal, fuera del programa | Nada — es el residual declarado |
| Que `archivarSecciones` pise el orden del admin | Lógica de negocio | La trampa documentada en `CLAUDE.md` |

CodeQL cubre bien: inyección, SSRF, XSS, path traversal, criptografía mal usada,
secretos en código, invariantes estructurales del árbol (módulos 3 y 6) y *hardening* de
Actions. Todo lo demás sigue siendo de los tests que ya tienes. **No es un reemplazo de la
suite; es una categoría distinta de guarda** — la que verifica propiedades del código en
vez de propiedades del comportamiento.

---

## Ruta corta

Si tienes una tarde y no diez:

1. Módulo 1 completo (instalar, crear las bases). 45 min.
2. Ejercicio 2.2 (encontrar los `fetch`). 15 min.
3. Módulo 3 entero, **incluida la demostración de 3.2**. 1,5 h.

Con eso ya sabes lo esencial: qué es una base de datos de CodeQL, cómo se consulta, y por
qué una consulta semántica atrapa lo que una regex no. Los módulos 4 y 6 son donde está el
valor de verdad para este repositorio, pero necesitan la base de los tres primeros.
