// GUARDA: todo lo que sale a la red pasa por un solo punto.
//
// No prueba una función: prueba una propiedad del árbol de código. Existe porque el
// cumplimiento de robots.txt es una consecuencia de la arquitectura, no de una
// comprobación repartida. `cliente-http.js` consulta la política y espera el Crawl-delay
// antes de delegar en `fetch-seguro.js`, que es el único autorizado a llamar a `fetch`.
// En cuanto un adaptador llame a `fetch` por su cuenta, ese adaptador queda fuera de la
// política y nadie se entera: la suite sigue verde y el sistema pide páginas que el medio
// prohibió.
//
// No es hipotético. `fuente-rss.js` y `fuente-sitemap-news.js` llamaban a `fetch` directo
// hasta hace poco, y en ese estado el respeto de robots.txt sobre feeds y sitemaps
// simplemente no ocurría. Nadie lo detectó porque nada lo vigilaba. Esto es lo que vigila.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

// Único archivo autorizado a invocar fetch. Si esta lista crece, la pregunta no es cómo
// actualizar el test: es por qué hay dos caminos a la red.
const AUTORIZADOS = ['adaptadores/fetch-seguro.js']

// `fetch(` con paréntesis a propósito. `transporte: fetch` (sin invocar) aparece en varios
// adaptadores como transporte por defecto para las pruebas herméticas, y es legítimo: no
// pide nada, solo nombra la función que el cliente usará. Lo que se persigue es la
// LLAMADA.
const LLAMADA_A_FETCH = /(^|[^.\w])fetch\s*\(/

export async function archivosJs(directorio) {
  const encontrados = []
  for (const entrada of await readdir(directorio, { withFileTypes: true })) {
    const completa = path.join(directorio, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...(await archivosJs(completa)))
    else if (entrada.name.endsWith('.js')) encontrados.push(completa)
  }
  return encontrados
}

/** @returns {{archivo:string, linea:number, texto:string}[]} */
export async function llamadasAFetchNoAutorizadas(raiz = RAIZ, autorizados = AUTORIZADOS) {
  const permitidos = new Set(autorizados.map((r) => path.resolve(raiz, r)))
  const hallazgos = []

  for (const archivo of await archivosJs(raiz)) {
    if (permitidos.has(archivo)) continue
    const contenido = await readFile(archivo, 'utf8')
    contenido.split(/\r?\n/).forEach((linea, indice) => {
      // Los comentarios que mencionan fetch son documentación, no una llamada.
      const sinComentario = linea.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
      if (LLAMADA_A_FETCH.test(sinComentario)) {
        hallazgos.push({
          archivo: path.relative(raiz, archivo).replace(/\\/g, '/'),
          linea: indice + 1,
          texto: linea.trim(),
        })
      }
    })
  }
  return hallazgos
}

describe('perímetro de red: un solo camino hacia afuera', () => {
  it('nadie llama a fetch fuera de adaptadores/fetch-seguro.js', async () => {
    const hallazgos = await llamadasAFetchNoAutorizadas()

    const detalle = hallazgos
      .map((h) => `  ${h.archivo}:${h.linea}  ${h.texto}`)
      .join('\n')

    expect(
      hallazgos,
      hallazgos.length === 0
        ? ''
        : `Hay ${hallazgos.length} llamada(s) a fetch fuera del punto único:\n${detalle}\n\n` +
            'POR QUÉ IMPORTA: robots.txt solo se puede hacer cumplir porque TODO pasa por\n' +
            'adaptadores/cliente-http.js -> adaptadores/fetch-seguro.js. Ese camino consulta\n' +
            'la política del dominio y espera el Crawl-delay ANTES de pedir. Un fetch directo\n' +
            'salta esa comprobación: el sistema pedirá páginas que el medio prohibió, sin que\n' +
            'ningún test falle y sin que quede rastro.\n\n' +
            'Usa el cliente inyectado (`cliente.pedir(...)`) en vez de fetch. Si de verdad\n' +
            'hace falta un segundo camino a la red, la conversación es de arquitectura, no de\n' +
            'actualizar esta lista.',
    ).toEqual([])
  })

  it('el detector encuentra una llamada real (no es decorativo)', async () => {
    // Sin este caso, un error en la expresión regular dejaría la guarda siempre en verde
    // y nadie lo notaría: es la trampa clásica de los tests que escanean código. Se
    // comprueba quitando la autorización a fetch-seguro.js, que sí llama a fetch.
    const hallazgos = await llamadasAFetchNoAutorizadas(RAIZ, [])

    expect(hallazgos.map((h) => h.archivo)).toContain('adaptadores/fetch-seguro.js')
  })

  it('no confunde `transporte: fetch` con una llamada', async () => {
    // El transporte por defecto de las pruebas herméticas nombra `fetch` sin invocarlo.
    // Si la guarda lo marcara, la salida sería ruido y alguien la desactivaría.
    const hallazgos = await llamadasAFetchNoAutorizadas()
    expect(hallazgos.map((h) => h.archivo)).not.toContain('adaptadores/fuente-rss.js')
  })
})
