import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearFuenteGoogleNews } from '../src/adaptadores/fuente-google-news.js'

const CONCEPTOS = ['CONAF', 'Corporación Nacional Forestal']

function feedGoogle(items) {
  const cuerpo = items
    .map(
      (i) => `<item>
      <title>${i.title}</title>
      <link>https://news.google.com/rss/articles/${i.id}?oc=5</link>
      <pubDate>Wed, 15 Jul 2026 12:00:00 GMT</pubDate>
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Google News</title>${cuerpo}</channel></rss>`
}

function stubFetchConFeed(xml) {
  const fetchMock = vi.fn(async () => new Response(xml, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Resolutor falso: mapea id de Google → URL real (o null para simular fallo).
function resolutorFalso(mapa) {
  const llamados = []
  return {
    llamados,
    async resolver(enlace) {
      const id = enlace.split('/articles/')[1].split('?')[0]
      llamados.push(id)
      return mapa[id] ?? null
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('crearFuenteGoogleNews', () => {
  it('resuelve enlaces y arma ítems con medio=dominio, fuente y sección otros', async () => {
    stubFetchConFeed(
      feedGoogle([
        { id: 'ID1', title: 'Cierre de parques de Conaf por sistema frontal - BioBioChile' },
        { id: 'ID2', title: 'CONAF entrega árboles nativos - La Cronica de Chillan' },
      ]),
    )
    const resolutor = resolutorFalso({
      ID1: 'https://www.biobiochile.cl/noticias/nacional/2026/07/15/cierre-parques.shtml',
      ID2: 'https://www.lacronica.cl/2026/07/15/arboles.html',
    })
    const { items, cache } = await crearFuenteGoogleNews({ conceptos: CONCEPTOS, resolutor }).obtener()

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      titular: 'Cierre de parques de Conaf por sistema frontal',
      url: 'https://www.biobiochile.cl/noticias/nacional/2026/07/15/cierre-parques.shtml',
      medioId: 'biobiochile.cl',
      medioNombre: 'BioBioChile',
      seccionId: 'otros',
      texto: '',
    })
    expect(cache.get('ID1')).toContain('biobiochile.cl')
  })

  it('descarta los ítems cuya resolución falla (nunca publica un link de Google)', async () => {
    stubFetchConFeed(
      feedGoogle([
        { id: 'OK', title: 'Nota buena - Medio A' },
        { id: 'FALLA', title: 'Nota irresoluble - Medio B' },
      ]),
    )
    const resolutor = resolutorFalso({ OK: 'https://medio-a.cl/nota' })
    const { items } = await crearFuenteGoogleNews({ conceptos: CONCEPTOS, resolutor }).obtener()

    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://medio-a.cl/nota')
    expect(items.some((i) => i.url.includes('news.google'))).toBe(false)
  })

  it('usa la caché previa y no re-resuelve ids conocidos', async () => {
    stubFetchConFeed(feedGoogle([{ id: 'CACHED', title: 'Ya conocida - Medio' }]))
    const resolutor = resolutorFalso({})
    const cachePrevia = new Map([['CACHED', 'https://medio.cl/ya-conocida']])
    const { items } = await crearFuenteGoogleNews({ conceptos: CONCEPTOS, resolutor, cachePrevia }).obtener()

    expect(items[0].url).toBe('https://medio.cl/ya-conocida')
    expect(resolutor.llamados).toHaveLength(0) // no se llamó al resolutor
  })

  it('respeta el tope de resoluciones por corrida', async () => {
    stubFetchConFeed(
      feedGoogle([
        { id: 'A', title: 'N1 - M' },
        { id: 'B', title: 'N2 - M' },
        { id: 'C', title: 'N3 - M' },
      ]),
    )
    const resolutor = resolutorFalso({ A: 'https://m.cl/1', B: 'https://m.cl/2', C: 'https://m.cl/3' })
    const { items } = await crearFuenteGoogleNews({
      conceptos: CONCEPTOS,
      resolutor,
      maxResoluciones: 2,
    }).obtener()

    expect(resolutor.llamados).toHaveLength(2) // solo 2 resoluciones
    expect(items).toHaveLength(2)
  })

  it('construye la consulta con los conceptos entre comillas y OR', async () => {
    const fetchMock = stubFetchConFeed(feedGoogle([]))
    await crearFuenteGoogleNews({ conceptos: CONCEPTOS, resolutor: resolutorFalso({}) }).obtener()
    const urlPedida = decodeURIComponent(fetchMock.mock.calls[0][0])
    expect(urlPedida).toContain('"CONAF" OR "Corporación Nacional Forestal"')
    expect(urlPedida).toContain('gl=CL')
  })

  it('separa correctamente títulos que contienen " - " internos', async () => {
    stubFetchConFeed(feedGoogle([{ id: 'X', title: 'CONAF: fuego - agua - y viento - El Diario' }]))
    const { items } = await crearFuenteGoogleNews({
      conceptos: CONCEPTOS,
      resolutor: resolutorFalso({ X: 'https://eldiario.cl/x' }),
    }).obtener()
    expect(items[0].titular).toBe('CONAF: fuego - agua - y viento')
    expect(items[0].medioNombre).toBe('El Diario')
  })

  it('lanza si el feed de Google responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    await expect(
      crearFuenteGoogleNews({ conceptos: CONCEPTOS, resolutor: resolutorFalso({}) }).obtener(),
    ).rejects.toThrow('HTTP 429')
  })

  it('excluye por nombre de fuente sin gastar resolución (caso conaf.cl)', async () => {
    stubFetchConFeed(
      feedGoogle([
        { id: 'PROPIO', title: 'Comunicado oficial - conaf.cl' },
        { id: 'PRENSA', title: 'Nota de prensa - Medio Real' },
      ]),
    )
    const resolutor = resolutorFalso({ PRENSA: 'https://medioreal.cl/nota' })
    const { items } = await crearFuenteGoogleNews({
      conceptos: CONCEPTOS,
      resolutor,
      dominiosExcluidos: ['conaf.cl'],
    }).obtener()

    expect(resolutor.llamados).toEqual(['PRENSA']) // conaf.cl no se resolvió
    expect(items).toHaveLength(1)
    expect(items[0].medioNombre).toBe('Medio Real')
  })

  it('excluye por dominio resuelto aunque el nombre de fuente difiera', async () => {
    stubFetchConFeed(feedGoogle([{ id: 'X', title: 'Comunicado - CONAF' }]))
    const resolutor = resolutorFalso({ X: 'https://www.conaf.cl/comunicado' })
    const { items, cache } = await crearFuenteGoogleNews({
      conceptos: CONCEPTOS,
      resolutor,
      dominiosExcluidos: ['conaf.cl'],
    }).obtener()

    expect(items).toHaveLength(0)
    expect(cache.has('X')).toBe(false) // no se cachea un dominio excluido
  })

  it('clasifica con la función provista (medio curado a su sección real)', async () => {
    stubFetchConFeed(feedGoogle([{ id: 'BB', title: 'Nota - BioBioChile' }]))
    const resolutor = resolutorFalso({ BB: 'https://www.biobiochile.cl/noticias/nota.shtml' })
    const clasificar = (dom, fuente) =>
      dom === 'biobiochile.cl'
        ? { medioId: 'radio-biobio', medioNombre: 'Radio Bío-Bío', seccionId: 'radio' }
        : { medioId: dom, medioNombre: fuente, seccionId: 'otros' }
    const { items } = await crearFuenteGoogleNews({
      conceptos: CONCEPTOS,
      resolutor,
      clasificar,
    }).obtener()

    expect(items[0]).toMatchObject({ medioId: 'radio-biobio', seccionId: 'radio', medioNombre: 'Radio Bío-Bío' })
  })
})
