import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  crearFuenteSitemapNews,
  parsearSitemapNews,
  quitarSufijoDeMedio,
} from '../src/adaptadores/fuente-sitemap-news.js'

const MEDIO = {
  id: 'meganoticias',
  nombre: 'Meganoticias',
  tipo: 'tv',
  sitemapUrl: 'https://www.meganoticias.cl/sitemaps/sitemap-news.xml',
}

// Builder de fixture: sitemap de noticias estándar en una sola línea (estilo
// Meganoticias). `urls` = [{loc, titulo, fecha}].
function sitemapNews(urls) {
  const bloques = urls
    .map(
      (u) =>
        `<url><loc>${u.loc}</loc><news:news><news:publication><news:name>Medio</news:name></news:publication>` +
        `<news:publication_date>${u.fecha}</news:publication_date><news:title>${u.titulo}</news:title></news:news></url>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${bloques}</urlset>`
}

function stubFetch(cuerpo, status = 200) {
  const fetchMock = vi.fn(async () => new Response(cuerpo, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Extractor falso: registra las URLs pedidas y devuelve texto según el mapa
// (undefined en el mapa ⇒ null, simulando página rota).
function extractorFalso(mapa = {}) {
  const llamados = []
  return {
    llamados,
    async obtenerContenido(url) {
      llamados.push(url)
      if (!(url in mapa)) return null
      return { texto: mapa[url], autor: null, fechaPublicacion: null }
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('parsearSitemapNews', () => {
  const ENTRADA_ESPERADA = {
    url: 'https://medio.cl/nota-1.html',
    titular: 'Conaf reabre parques',
    fecha: '2026-07-20T10:00:00-04:00',
  }

  it('parsea el formato de una sola línea (estilo Meganoticias)', () => {
    const xml = sitemapNews([
      { loc: 'https://medio.cl/nota-1.html', titulo: 'Conaf reabre parques', fecha: '2026-07-20T10:00:00-04:00' },
    ])
    expect(parsearSitemapNews(xml)).toEqual([ENTRADA_ESPERADA])
  })

  it('parsea XML indentado multilínea (estilo El Divisadero)', () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
        <url>
          <loc>https://medio.cl/nota-1.html</loc>
          <news:news>
            <news:publication_date>2026-07-20T10:00:00-04:00</news:publication_date>
            <news:title>Conaf reabre parques</news:title>
          </news:news>
        </url>
      </urlset>`
    expect(parsearSitemapNews(xml)).toEqual([ENTRADA_ESPERADA])
  })

  it('parsea campos con CDATA (estilo Puranoticia)', () => {
    const xml = `<urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url>
      <loc><![CDATA[https://medio.cl/nota-1.html]]></loc>
      <news:news><news:publication_date><![CDATA[2026-07-20T10:00:00-04:00]]></news:publication_date>
      <news:title><![CDATA[Conaf reabre parques]]></news:title></news:news>
    </url></urlset>`
    expect(parsearSitemapNews(xml)).toEqual([ENTRADA_ESPERADA])
  })

  it('descarta bloques sin <loc> o sin <news:news> sin romper el resto', () => {
    const xml = `<urlset xmlns:news="x"><url><loc>https://medio.cl/sin-news.html</loc></url>
      <url><news:news><news:title>Sin loc</news:title></news:news></url>
      <url><loc>https://medio.cl/buena.html</loc><news:news><news:title>Buena</news:title>
      <news:publication_date>2026-07-20T10:00:00-04:00</news:publication_date></news:news></url></urlset>`
    const entradas = parsearSitemapNews(xml)
    expect(entradas).toHaveLength(1)
    expect(entradas[0].url).toBe('https://medio.cl/buena.html')
  })

  it('soporta un prefijo de namespace distinto de news: (estilo Radio Pauta)', () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:n="http://www.google.com/schemas/sitemap-news/0.9"><url>
      <loc>https://medio.cl/nota-1.html</loc>
      <n:news><n:publication_date>2026-07-20T10:00:00-04:00</n:publication_date>
      <n:title>Conaf reabre parques</n:title></n:news>
    </url></urlset>`
    expect(parsearSitemapNews(xml)).toEqual([ENTRADA_ESPERADA])
  })

  it('decodifica entidades XML en el título', () => {
    const xml = sitemapNews([
      { loc: 'https://medio.cl/n.html', titulo: 'Bosques &amp; parques: &quot;alerta&quot;', fecha: '2026-07-20T10:00:00-04:00' },
    ])
    expect(parsearSitemapNews(xml)[0].titular).toBe('Bosques & parques: "alerta"')
  })
})

describe('quitarSufijoDeMedio', () => {
  it('quita solo el sufijo exacto del medio al final', () => {
    expect(quitarSufijoDeMedio('Conaf reabre parques - Meganoticias', 'Meganoticias')).toBe(
      'Conaf reabre parques',
    )
  })

  it('no toca un titular con " - " interno ni uno sin sufijo', () => {
    expect(quitarSufijoDeMedio('Temporal - en vivo - las claves', 'Meganoticias')).toBe(
      'Temporal - en vivo - las claves',
    )
    expect(quitarSufijoDeMedio('Conaf reabre parques', 'Meganoticias')).toBe('Conaf reabre parques')
  })
})

describe('crearFuenteSitemapNews', () => {
  it('descarga la página de cada URL nueva y emite ítems con el contrato completo', async () => {
    stubFetch(
      sitemapNews([
        { loc: 'https://medio.cl/a.html', titulo: 'Nota A - Meganoticias', fecha: '2026-07-20T10:00:00-04:00' },
      ]),
    )
    const extractor = extractorFalso({ 'https://medio.cl/a.html': 'Cuerpo con Conaf adentro' })
    const { items, cache } = await crearFuenteSitemapNews({ extractor }).obtener(MEDIO)

    expect(extractor.llamados).toEqual(['https://medio.cl/a.html'])
    expect(items).toEqual([
      {
        titular: 'Nota A',
        url: 'https://medio.cl/a.html',
        fecha: '2026-07-20T10:00:00-04:00',
        texto: 'Cuerpo con Conaf adentro',
      },
    ])
    expect([...cache]).toEqual(['https://medio.cl/a.html'])
  })

  it('omite por completo las URLs ya vistas (no llama al extractor)', async () => {
    stubFetch(
      sitemapNews([
        { loc: 'https://medio.cl/vista.html', titulo: 'Vieja', fecha: '2026-07-19T10:00:00-04:00' },
        { loc: 'https://medio.cl/nueva.html', titulo: 'Nueva', fecha: '2026-07-20T10:00:00-04:00' },
      ]),
    )
    const extractor = extractorFalso({ 'https://medio.cl/nueva.html': 'texto' })
    const { items, cache } = await crearFuenteSitemapNews({
      extractor,
      cachePrevia: new Set(['https://medio.cl/vista.html']),
    }).obtener(MEDIO)

    expect(extractor.llamados).toEqual(['https://medio.cl/nueva.html'])
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://medio.cl/nueva.html')
    // La vista sigue en caché (está en el sitemap actual).
    expect([...cache].sort()).toEqual(['https://medio.cl/nueva.html', 'https://medio.cl/vista.html'])
  })

  it('respeta maxDescargas procesando la más reciente y deja el resto para la próxima corrida', async () => {
    stubFetch(
      sitemapNews([
        { loc: 'https://medio.cl/vieja.html', titulo: 'Vieja', fecha: '2026-07-18T10:00:00-04:00' },
        { loc: 'https://medio.cl/reciente.html', titulo: 'Reciente', fecha: '2026-07-20T10:00:00-04:00' },
        { loc: 'https://medio.cl/media.html', titulo: 'Media', fecha: '2026-07-19T10:00:00-04:00' },
      ]),
    )
    const extractor = extractorFalso({ 'https://medio.cl/reciente.html': 'texto' })
    const { items, cache } = await crearFuenteSitemapNews({ extractor, maxDescargas: 1 }).obtener(MEDIO)

    expect(extractor.llamados).toEqual(['https://medio.cl/reciente.html'])
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://medio.cl/reciente.html')
    // Solo la procesada entra a la caché: las otras se reintentan después.
    expect([...cache]).toEqual(['https://medio.cl/reciente.html'])
  })

  it('poda de la caché las URLs que ya salieron del sitemap', async () => {
    stubFetch(
      sitemapNews([
        { loc: 'https://medio.cl/presente.html', titulo: 'Presente', fecha: '2026-07-20T10:00:00-04:00' },
      ]),
    )
    const { cache } = await crearFuenteSitemapNews({
      extractor: extractorFalso({ 'https://medio.cl/presente.html': 'texto' }),
      cachePrevia: new Set(['https://medio.cl/presente.html', 'https://medio.cl/rotada.html']),
    }).obtener(MEDIO)

    expect(cache.has('https://medio.cl/rotada.html')).toBe(false)
    expect(cache.has('https://medio.cl/presente.html')).toBe(true)
  })

  it('página rota (extractor null) ⇒ ítem con texto vacío y URL marcada vista', async () => {
    stubFetch(
      sitemapNews([
        { loc: 'https://medio.cl/rota.html', titulo: 'Conaf en el titular', fecha: '2026-07-20T10:00:00-04:00' },
      ]),
    )
    const { items, cache } = await crearFuenteSitemapNews({ extractor: extractorFalso({}) }).obtener(MEDIO)

    expect(items).toEqual([
      { titular: 'Conaf en el titular', url: 'https://medio.cl/rota.html', fecha: '2026-07-20T10:00:00-04:00', texto: '' },
    ])
    expect(cache.has('https://medio.cl/rota.html')).toBe(true)
  })

  it('lanza ante HTTP no-ok y ante un sitemapindex', async () => {
    stubFetch('error', 500)
    await expect(
      crearFuenteSitemapNews({ extractor: extractorFalso() }).obtener(MEDIO),
    ).rejects.toThrow('HTTP 500')

    stubFetch('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x/s.xml</loc></sitemap></sitemapindex>')
    await expect(
      crearFuenteSitemapNews({ extractor: extractorFalso() }).obtener(MEDIO),
    ).rejects.toThrow('urlset')
  })

  it('envía el User-Agent configurado', async () => {
    const fetchMock = stubFetch(sitemapNews([]))
    await crearFuenteSitemapNews({ extractor: extractorFalso(), userAgent: 'COIPO_PRENSA/1.0' }).obtener(MEDIO)
    expect(fetchMock.mock.calls[0][1].headers['user-agent']).toBe('COIPO_PRENSA/1.0')
  })
})
