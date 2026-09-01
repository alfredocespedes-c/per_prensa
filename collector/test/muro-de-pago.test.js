// Muro de pago BLANDO: el medio responde 200 con el artículo completo en el HTML y se lo
// oculta al lector con CSS o JavaScript. El collector no ejecuta ninguno de los dos, así
// que leía ese contenido como texto normal y de ahí salía un extracto que SÍ se
// almacenaba: contenido que el medio decidió cobrar, guardado sin que nadie lo programara.
//
// La señal es del propio medio: `isAccessibleForFree: false` en su JSON-LD, que Google le
// exige para no penalizarlo por cloaking.

import { describe, expect, it, vi } from 'vitest'
import {
  crearExtractorContenido,
  declaraMuroDePago,
  leerBloquesJsonLd,
} from '../src/adaptadores/extractor-contenido.js'

const CUERPO = '<article><p>El texto pagado del artículo, párrafo uno.</p>' +
  '<p>Párrafo dos.</p><p>Párrafo tres.</p></article>'

const conJsonLd = (objeto, cuerpo = CUERPO) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(objeto)}</script></head>` +
  `<body>${cuerpo}</body></html>`

describe('leerBloquesJsonLd', () => {
  it('lee TODOS los bloques, no solo el primero', () => {
    // Es la razón de existir de este ayudante: extraerAutor mira solo el primero, y
    // muchos medios ponen Organization primero y NewsArticle después.
    const html =
      '<script type="application/ld+json">{"@type":"Organization"}</script>' +
      '<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script>'

    expect(leerBloquesJsonLd(html)).toHaveLength(2)
    expect(declaraMuroDePago(html)).toBe(true)
  })

  it('aplana arrays y @graph', () => {
    const conGraph = conJsonLd({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'NewsArticle' }] })
    expect(leerBloquesJsonLd(conGraph).length).toBeGreaterThanOrEqual(3)

    const conArray = conJsonLd([{ '@type': 'A' }, { '@type': 'B' }])
    expect(leerBloquesJsonLd(conArray)).toHaveLength(2)
  })

  it('un JSON-LD inválido se ignora sin lanzar', () => {
    const html = '<script type="application/ld+json">{esto no es json}</script>'
    expect(leerBloquesJsonLd(html)).toEqual([])
    expect(declaraMuroDePago(html)).toBe(false)
  })
})

describe('declaraMuroDePago', () => {
  it('detecta la forma directa', () => {
    expect(declaraMuroDePago(conJsonLd({ '@type': 'NewsArticle', isAccessibleForFree: false }))).toBe(true)
  })

  it('detecta la forma anidada con hasPart y cssSelector', () => {
    // Es la que Google documenta para artículos parcialmente abiertos.
    const html = conJsonLd({
      '@type': 'NewsArticle',
      isAccessibleForFree: false,
      hasPart: {
        '@type': 'WebPageElement',
        isAccessibleForFree: false,
        cssSelector: '.paywalled',
      },
    })
    expect(declaraMuroDePago(html)).toBe(true)
  })

  it('detecta hasPart de pago aunque el artículo se declare gratis', () => {
    const html = conJsonLd({
      '@type': 'NewsArticle',
      isAccessibleForFree: true,
      hasPart: [{ '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.pago' }],
    })
    expect(declaraMuroDePago(html)).toBe(true)
  })

  it('con isAccessibleForFree: true NO hay muro', () => {
    expect(declaraMuroDePago(conJsonLd({ '@type': 'NewsArticle', isAccessibleForFree: true }))).toBe(false)
  })

  it('FAIL-OPEN: sin el campo, no hay muro', () => {
    // La ausencia de declaración no es una declaración de que es de pago. Asumir lo
    // contrario dejaría fuera del boletín a la mayoría de los medios, que no marcan nada
    // porque no tienen muro.
    expect(declaraMuroDePago(conJsonLd({ '@type': 'NewsArticle', author: { name: 'X' } }))).toBe(false)
    expect(declaraMuroDePago('<html><body><p>sin json-ld</p></body></html>')).toBe(false)
    expect(declaraMuroDePago('')).toBe(false)
    expect(declaraMuroDePago(null)).toBe(false)
  })

  it('FAIL-OPEN ante un valor que no se entiende', () => {
    for (const valor of ['quizás', 0, null, undefined, {}]) {
      expect(declaraMuroDePago(conJsonLd({ isAccessibleForFree: valor }))).toBe(false)
    }
  })

  it('acepta la cadena "False", que algunos medios emiten', () => {
    expect(declaraMuroDePago(conJsonLd({ isAccessibleForFree: 'False' }))).toBe(true)
  })
})

describe('crearExtractorContenido con muro de pago', () => {
  const respuesta = (html) => ({
    ok: true,
    status: 200,
    url: 'https://medio.cl/nota',
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? 'text/html' : null) },
    // arrayBuffer y no text(): el extractor lee los bytes para poder respetar el charset
    // que declara el medio (hay prensa regional en ISO-8859-1).
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  })

  const extractorCon = (html) => {
    const cliente = { pedir: vi.fn(async () => respuesta(html)) }
    return crearExtractorContenido({ userAgent: 'test/1.0', cliente })
  }

  it('NO extrae el cuerpo cuando el medio declara muro', async () => {
    const html = conJsonLd({
      '@type': 'NewsArticle',
      isAccessibleForFree: false,
      author: { name: 'Redacción' },
      datePublished: '2026-08-01T10:00:00Z',
    })

    const contenido = await extractorCon(html).obtenerContenido('https://medio.cl/nota')

    expect(contenido.texto).toBe('')
    expect(contenido.cuerpoOmitidoPorMuro).toBe(true)
    expect(contenido.texto).not.toContain('pagado')
  })

  it('la noticia sigue publicable: conserva autor y fecha', async () => {
    // La medida no es dejar de listar la nota — el titular y el enlace son justamente lo
    // que el medio expone para ser enlazado. Es dejar de leerle el texto.
    const html = conJsonLd({
      '@type': 'NewsArticle',
      isAccessibleForFree: false,
      author: { name: 'Redacción' },
      datePublished: '2026-08-01T10:00:00Z',
    })

    const contenido = await extractorCon(html).obtenerContenido('https://medio.cl/nota')

    expect(contenido.autor).toBe('Redacción')
    expect(contenido.fechaPublicacion).toBe('2026-08-01T10:00:00.000Z')
  })

  it('sin muro, el cuerpo se extrae como siempre', async () => {
    const html = conJsonLd({ '@type': 'NewsArticle', isAccessibleForFree: true })

    const contenido = await extractorCon(html).obtenerContenido('https://medio.cl/nota')

    expect(contenido.texto).toContain('párrafo uno')
    expect(contenido.cuerpoOmitidoPorMuro).toBe(false)
  })

  it('cuenta las notas omitidas para el resumen de la corrida', async () => {
    // Sin el número no se puede responder si el problema era grande o inexistente, que es
    // lo que hay que saber para decidir si la medida basta.
    const extractor = extractorCon(conJsonLd({ isAccessibleForFree: false }))

    expect(extractor.estadisticas().omitidasPorMuro).toBe(0)
    await extractor.obtenerContenido('https://medio.cl/a')
    await extractor.obtenerContenido('https://medio.cl/b')

    expect(extractor.estadisticas().omitidasPorMuro).toBe(2)
  })

  it('no cuenta las notas sin muro', async () => {
    const extractor = extractorCon(conJsonLd({ isAccessibleForFree: true }))
    await extractor.obtenerContenido('https://medio.cl/a')
    expect(extractor.estadisticas().omitidasPorMuro).toBe(0)
  })
})
