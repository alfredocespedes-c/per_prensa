// Extrae contenido de un artículo web: texto, autor y fecha de publicación.
// Una sola descarga por URL que alimenta múltiples campos del enriquecimiento.
//
// NO extrae imágenes, y la ausencia es la medida. El sistema guardaba la URL del og:image
// y el navegador del lector la pedía al servidor del medio; el departamento legal resolvió
// eliminar las imágenes de las dos superficies, así que el dato dejó de producirse. No
// reintroducir `extraerImagen`: sin extracción no hay nada que mostrar por descuido.

import { crearClienteHttp, leerTexto } from './cliente-http.js'
import { fetchSeguro } from './fetch-seguro.js'
import { limpiarHtmlDeNavegacion } from './limpieza-html.js'

// Tope de tamaño de descarga (SEC-06): rechazo por Content-Length declarado ANTES de
// bufferizar. Protección PARCIAL — un servidor que omite Content-Length (o usa chunked)
// lo evade; el cierre total exigiría lectura por streaming (ver REMEDIACION.md).
const MAX_BYTES_DESCARGA = 10_000_000

function decodificarEntidades(texto) {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
}

// Texto visible mínimo para creerle a un contenedor semántico que es el cuerpo de la nota.
//
// Hay medios donde el cuerpo NO vive en un <article> y los únicos <article> de la página
// son las tarjetas de "Lee También" (caso medido: 125 caracteres). Sin este piso, el
// extractor prefería esa tarjeta al cuerpo real y la noticia entraba —o dejaba de entrar—
// por el texto equivocado.
//
// Rechazar de más es SEGURO: se cae al siguiente intento (<main>, párrafos densos), que
// siempre devuelve un superconjunto. Rechazar de menos es lo que hace perder noticias.
const MINIMO_CONTENEDOR = 400

// Devuelve el contenido del contenedor `etiqueta` con más texto, o null si ninguno alcanza
// el piso.
//
// Coste lineal: un solo cuantificador no codicioso con tope, recorrido una vez. NO usar
// recursión ni cuantificadores anidados (ver la nota de ReDoS más abajo).
function contenedorMasLargo(html, etiqueta) {
  const patron = new RegExp(`<${etiqueta}\\b[^>]*>([\\s\\S]{0,200000}?)</${etiqueta}>`, 'gi')
  let mejor = null
  let mejorLargo = 0
  for (const m of html.matchAll(patron)) {
    // Se puntúa por texto visible, no por bytes de HTML: un contenedor lleno de <svg> o de
    // atributos data-* no es el cuerpo de la nota por mucho que pese.
    const largo = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
    if (largo > mejorLargo) {
      mejorLargo = largo
      mejor = m[1]
    }
  }
  return mejorLargo >= MINIMO_CONTENEDOR ? mejor : null
}

export function extraerTexto(html) {
  if (!html || typeof html !== 'string') return ''

  // Fuera menús, barras laterales, pies y tarjetas que enlazan a OTRAS notas, ANTES de
  // elegir contenedor. Sin esto, un <main> que envuelve toda la página (radiopolar.com) se
  // trae el listado de titulares ajenos, y aplanar el HTML conserva el texto de los <a>:
  // de ahí salió una nota policial atribuida al concepto «Forestin». Ver limpieza-html.js.
  //
  // Va primero a propósito: así el fallback de párrafos de más abajo tampoco recoge los <p>
  // que vivían dentro de una tarjeta.
  const limpio = limpiarHtmlDeNavegacion(html)

  // Buscar el contenido principal: <article>, <main>, o bloque denso de <p>
  let contenido = ''

  // Intento 1: <article> — el que MÁS TEXTO tiene, no el primero.
  //
  // Tomar el primero era una apuesta que se pierde seguido: hay medios que maquetan cada
  // tarjeta de "Lee También" como su propio <article> y los anidan dentro del artículo real
  // (un caso medido: 14 <article> en una sola nota). Con la coincidencia no codiciosa, el
  // primer </article> que aparece cierra una tarjeta interior, y el extractor se llevaba
  // 114 caracteres de "Lee También" en vez del cuerpo. Elegir por volumen de texto es
  // robusto ante el anidamiento y ante el orden en que el medio los emita.
  const articulo = contenedorMasLargo(limpio, 'article')
  if (articulo) contenido = articulo
  else {
    // Intento 2: <main>, con el mismo criterio.
    const main = contenedorMasLargo(limpio, 'main')
    if (main) contenido = main
    else {
      // Intento 3: bloque denso de <p>. Se recolectan los párrafos del documento
      // en lugar de casar todo el <div> con una sola regex. El patrón anterior
      // (`<div>(?:...<p>[\s\S]*?</p>[\s\S]*?){3,}</div>`) tenía dos cuantificadores
      // [\s\S]*? anidados bajo {3,} con un </div> final obligatorio: ante HTML
      // atacante (un <div> con N bloques <p> y sin </div> de cierre) entraba en
      // backtracking catastrófico (ReDoS) y congelaba el hilo único del collector,
      // abortando la corrida horaria. Aquí cada <p> se acota en longitud
      // ({0,20000}?) y la entrada total se limita, de modo que el coste es lineal.
      const parrafos = limpio.slice(0, 500_000).match(/<p[^>]*>[\s\S]{0,20000}?<\/p>/gi)
      // Último recurso: el documento entero. Se mantiene a propósito —quitarlo haría perder
      // notas completas, y perder una noticia de un medio grande es el error inaceptable
      // nº 2 de SECOM—, pero ahora opera sobre el HTML YA limpio de navegación y tarjetas.
      contenido = parrafos && parrafos.length >= 3 ? parrafos.join(' ') : limpio
    }
  }

  // Limpiar HTML: remove scripts, styles, tags
  let texto = contenido
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\r\n]+/g, '\n')

  // Decodificar entidades
  texto = decodificarEntidades(texto)
    .replace(/\s+/g, ' ')
    .trim()

  // Limitar a 5000 caracteres
  return texto.slice(0, 5000)
}

// --- Muro de pago blando ------------------------------------------------------------
//
// Un muro DURO responde 401/402/403 o simplemente no trae el artículo: el extractor ya
// devuelve null y no hay nada que decidir. El BLANDO es el problema: responde 200 con el
// artículo COMPLETO en el HTML y se lo oculta al lector con CSS o JavaScript.
//
// El collector no ejecuta ninguno de los dos. `extraerTexto` lee ese contenido como texto
// normal, y de ahí sale un extracto que SÍ se almacena. Es decir: el sistema puede llevar
// meses guardando contenido que el medio decidió cobrar, sin que nadie lo programara y sin
// forma de notarlo desde afuera.
//
// Los medios con muro lo DECLARAN: `"isAccessibleForFree": false` en su JSON-LD, porque
// Google se lo exige para no penalizarlos por cloaking (mostrarle al buscador algo que al
// lector le cobra). Esa declaración es la señal más fiable que existe, y es del propio
// medio.

/**
 * Todos los bloques JSON-LD del documento, aplanando arrays y `@graph`.
 *
 * `extraerAutor` mira SOLO el primer bloque, y muchos medios publican varios
 * (Organization, BreadcrumbList, NewsArticle) o los envuelven en `@graph`, así que la
 * declaración de muro puede estar donde ese parseo nunca llega. Esta función se usa solo
 * acá a propósito: cambiar también `extraerAutor` alteraría comportamiento que hoy nadie
 * pidió tocar. Queda anotado como mejora pendiente.
 */
export function leerBloquesJsonLd(html) {
  if (!html || typeof html !== 'string') return []

  const bloques = []
  const patron = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const coincidencia of html.matchAll(patron)) {
    let datos
    try {
      datos = JSON.parse(coincidencia[1])
    } catch {
      continue // JSON inválido: se ignora, no se adivina
    }
    const pendientes = Array.isArray(datos) ? [...datos] : [datos]
    while (pendientes.length > 0) {
      const nodo = pendientes.pop()
      if (!nodo || typeof nodo !== 'object') continue
      bloques.push(nodo)
      if (Array.isArray(nodo['@graph'])) pendientes.push(...nodo['@graph'])
    }
  }
  return bloques
}

/**
 * ¿El medio declara que este artículo NO es de acceso libre?
 *
 * FAIL-OPEN deliberado: si el campo falta, viene en otro tipo o no se entiende, se
 * responde `false`. **La ausencia de declaración no es una declaración de que es de
 * pago**: asumir lo contrario dejaría fuera del boletín a la mayoría de los medios, que
 * no marcan nada porque no tienen muro.
 */
export function declaraMuroDePago(html) {
  for (const nodo of leerBloquesJsonLd(html)) {
    // Forma directa: el propio artículo se declara de pago.
    if (nodo.isAccessibleForFree === false || nodo.isAccessibleForFree === 'False') {
      return true
    }
    // Forma anidada, que es la que Google documenta: el artículo es "gratis" pero una
    // parte (hasPart, con su cssSelector) queda tras el muro.
    const partes = Array.isArray(nodo.hasPart) ? nodo.hasPart : [nodo.hasPart]
    for (const parte of partes) {
      if (!parte || typeof parte !== 'object') continue
      if (parte.isAccessibleForFree === false || parte.isAccessibleForFree === 'False') {
        return true
      }
    }
  }
  return false
}

export function extraerAutor(html) {
  if (!html || typeof html !== 'string') return null

  // Patrón 1: JSON-LD "author"
  const jsonld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (jsonld) {
    try {
      const datos = JSON.parse(jsonld)
      if (datos.author?.name) return datos.author.name
      if (datos.author?.name) return datos.author.name
      if (typeof datos.author === 'string') return datos.author
    } catch {
      // JSON inválido
    }
  }

  // Patrón 2: meta "article:author"
  const meta1 = html.match(/<meta[^>]+name=["']article:author["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (meta1) return meta1

  // Patrón 3: meta "author"
  const meta2 = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (meta2) return meta2

  return null
}

export function extraerFechaPublicacion(html) {
  if (!html || typeof html !== 'string') return null

  // Patrón 1: JSON-LD "datePublished"
  const jsonld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (jsonld) {
    try {
      const datos = JSON.parse(jsonld)
      if (datos.datePublished) {
        const fecha = new Date(datos.datePublished)
        if (!isNaN(fecha)) return fecha.toISOString()
      }
    } catch {
      // JSON inválido
    }
  }

  // Patrón 2: meta "article:published_time"
  const meta1 = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (meta1) {
    const fecha = new Date(meta1)
    if (!isNaN(fecha)) return fecha.toISOString()
  }

  // Patrón 3: meta "publish_date" o "published"
  const meta2 =
    html.match(/<meta[^>]+name=["']publish_date["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+name=["']published["'][^>]+content=["']([^"']+)["']/i)?.[1]
  if (meta2) {
    const fecha = new Date(meta2)
    if (!isNaN(fecha)) return fecha.toISOString()
  }

  return null
}

export function crearExtractorContenido({ timeoutMs = 15000, userAgent, cliente = null } = {}) {
  // Por defecto sigue usando fetchSeguro directamente (comportamiento histórico, que es
  // el que prueban los tests). En producción main.js inyecta el cliente con la política
  // de robots.txt: la descarga del artículo es justamente la petición que más importa
  // que el medio haya autorizado.
  const http = cliente ?? crearClienteHttp({ userAgent, timeoutMs, transporte: fetchSeguro })

  // Cuántas notas se quedaron sin cuerpo por declarar muro de pago. Sin este número no se
  // puede responder si el problema era grande o inexistente, que es justo lo que hay que
  // saber para decidir si la medida basta.
  let omitidasPorMuro = 0

  return {
    // Devuelve {texto, autor, fechaPublicacion, cuerpoOmitidoPorMuro} o null. Nunca lanza.
    async obtenerContenido(urlArticulo) {
      try {
        // SEC-03: el transporte es fetchSeguro, que valida esquema + host (IP privada
        // literal/DNS) y sigue las redirecciones revalidando cada salto.
        const respuesta = await http.pedir(urlArticulo, {
          headers: { accept: 'text/html' },
          timeoutMs,
        })
        if (!respuesta.ok) return null

        const tipo = respuesta.headers.get('content-type') ?? ''
        if (!tipo.includes('html')) return null

        // SEC-06: no bufferizar cuerpos declarados enormes (protección parcial).
        const largo = Number(respuesta.headers.get('content-length'))
        if (Number.isFinite(largo) && largo > MAX_BYTES_DESCARGA) return null

        // leerTexto y no respuesta.text(): buena parte de la prensa regional sirve
        // ISO-8859-1 y decodificarla como UTF-8 corrompe el extracto que se almacena.
        const html = await leerTexto(respuesta)

        // El medio declara que este artículo se cobra: NO se extrae el cuerpo. Se
        // devuelve todo lo demás para que la noticia siga publicándose con su titular y
        // el enlace al original — que es lo que el medio sí expone para ser enlazado. Lo
        // que no hacemos es leerle el texto por la puerta de atrás.
        const conMuro = declaraMuroDePago(html)
        if (conMuro) omitidasPorMuro += 1

        return {
          texto: conMuro ? '' : extraerTexto(html),
          autor: extraerAutor(html),
          fechaPublicacion: extraerFechaPublicacion(html),
          cuerpoOmitidoPorMuro: conMuro,
        }
      } catch {
        return null
      }
    },

    /** Contadores de la corrida, para el resumen de main.js. */
    estadisticas() {
      return { omitidasPorMuro }
    },
  }
}
