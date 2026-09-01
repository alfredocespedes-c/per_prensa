import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearFuenteRss, enlaceDesdeTitulo } from '../src/adaptadores/fuente-rss.js'

const MEDIO = { id: 'medio-prueba', nombre: 'Medio Prueba', tipo: 'escrita', feedUrl: 'https://medio.cl/rss' }

function respuestaXml(xml, opciones = {}) {
  return new Response(xml, {
    status: opciones.status ?? 200,
    // Content-Type deliberadamente incorrecto: el adaptador no debe validarlo
    // (BioBioChile sirve su RSS como application/octet-stream).
    headers: { 'content-type': opciones.contentType ?? 'application/octet-stream' },
  })
}

const FEED_BASICO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Medio Prueba</title>
    <item>
      <title>Brigadistas de &lt;b&gt;Conaf&lt;/b&gt; controlan incendio</title>
      <link>https://medio.cl/nota-1</link>
      <pubDate>Mon, 13 Jul 2026 08:00:00 -0400</pubDate>
      <description>&lt;p&gt;El equipo de CONAF trabaj&#243; toda la noche&amp;nbsp;en el cerro.&lt;/p&gt;</description>
    </item>
    <item>
      <title>Ítem sin link que debe descartarse</title>
      <description>texto</description>
    </item>
    <item>
      <title>Nota con contenido completo</title>
      <link>https://medio.cl/nota-2</link>
      <content:encoded>&lt;p&gt;Cuerpo completo con la Corporaci&#243;n Nacional Forestal mencionada&lt;/p&gt;</content:encoded>
      <description>resumen sin mención</description>
    </item>
  </channel>
</rss>`

// El <link> de interferencia.cl es la etiqueta <a> del título URL-encodeada y pegada al
// dominio: un 404 seguro. Por eso el medio estuvo descartado en docs/MEDIOS.md. `medio.
// enlaceEnTitulo` es OPT-IN: ningún otro medio cambia de comportamiento.
const FEED_ENLACE_EN_TITULO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Interferencia</title>
    <item>
      <title>&lt;a href="/articulos/conaf-y-el-fuego"&gt;CONAF y el fuego&lt;/a&gt;</title>
      <link>https://interferencia.cl/%3Ca%20href%3D%22/articulos/conaf-y-el-fuego%22%3E</link>
      <pubDate>Mon, 17 Aug 2026 08:00:00 -0400</pubDate>
      <description>texto</description>
    </item>
    <item>
      <title>Titular sin ninguna etiqueta a</title>
      <link>https://interferencia.cl/%3Ca%20roto</link>
      <description>texto</description>
    </item>
  </channel>
</rss>`

describe('enlaceDesdeTitulo', () => {
  const BASE = 'https://interferencia.cl/rss.xml'

  it('rescata el href y lo resuelve contra el origen del feed', () => {
    expect(enlaceDesdeTitulo('<a href="/articulos/x">X</a>', BASE))
      .toBe('https://interferencia.cl/articulos/x')
  })

  it('acepta comillas simples y atributos antes del href', () => {
    expect(enlaceDesdeTitulo("<a class='t' href='/articulos/y'>Y</a>", BASE))
      .toBe('https://interferencia.cl/articulos/y')
  })

  it('respeta una URL absoluta si el href ya la trae', () => {
    expect(enlaceDesdeTitulo('<a href="https://otro.cl/n">N</a>', BASE)).toBe('https://otro.cl/n')
  })

  it('FALLA CERRADO sin href: devuelve null en vez de adivinar', () => {
    // Publicar un link roto es uno de los cuatro errores inaceptables para SECOM, así que
    // perder la nota es preferible a listarla con una dirección inventada.
    for (const entrada of ['Titular plano', '<a>sin href</a>', '', null, undefined, 42]) {
      expect(enlaceDesdeTitulo(entrada, BASE)).toBe(null)
    }
  })

  it('FALLA CERRADO ante un esquema que no es http/https (javascript:, data:)', () => {
    expect(enlaceDesdeTitulo('<a href="javascript:alert(1)">x</a>', BASE)).toBe(null)
    expect(enlaceDesdeTitulo('<a href="data:text/html,x">x</a>', BASE)).toBe(null)
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('crearFuenteRss', () => {
  it('parsea el feed sin validar content-type y limpia HTML/entidades', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml(FEED_BASICO)))
    const items = await crearFuenteRss().obtener(MEDIO)

    expect(items).toHaveLength(2) // el ítem sin link se descarta
    expect(items[0].titular).toBe('Brigadistas de Conaf controlan incendio')
    expect(items[0].url).toBe('https://medio.cl/nota-1')
    expect(items[0].texto).toBe('El equipo de CONAF trabajó toda la noche en el cerro.')
    expect(items[0].fecha).toBeTruthy()
  })

  it('prefiere content:encoded (cuerpo completo) sobre la descripción', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml(FEED_BASICO)))
    const items = await crearFuenteRss().obtener(MEDIO)
    expect(items[1].texto).toContain('Corporación Nacional Forestal')
  })

  it('lanza ante HTTP no-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml('', { status: 503 })))
    await expect(crearFuenteRss().obtener(MEDIO)).rejects.toThrow('HTTP 503')
  })

  it('lanza ante XML malformado sin reventar el proceso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml('esto no es xml <<<')))
    await expect(crearFuenteRss().obtener(MEDIO)).rejects.toThrow()
  })

  it('envía el User-Agent configurado', async () => {
    const fetchEspiado = vi.fn(async () => respuestaXml(FEED_BASICO))
    vi.stubGlobal('fetch', fetchEspiado)
    await crearFuenteRss({ userAgent: 'AgentePrueba/9' }).obtener(MEDIO)
    expect(fetchEspiado.mock.calls[0][1].headers['user-agent']).toBe('AgentePrueba/9')
  })

  it('con enlaceEnTitulo usa el href del título y NO el <link> roto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml(FEED_ENLACE_EN_TITULO)))

    const items = await crearFuenteRss().obtener({
      ...MEDIO,
      id: 'interferencia',
      feedUrl: 'https://interferencia.cl/rss.xml',
      enlaceEnTitulo: true,
    })

    expect(items).toHaveLength(1) // el segundo ítem, sin <a>, se descarta
    expect(items[0].url).toBe('https://interferencia.cl/articulos/conaf-y-el-fuego')
    expect(items[0].url).not.toContain('%3Ca') // jamás el <link> original
    expect(items[0].titular).toBe('CONAF y el fuego') // el título sale limpio de etiquetas
  })

  it('sin el flag, el mismo feed produce el <link> roto (el flag es opt-in de verdad)', async () => {
    // Comprueba que la corrección no se aplica sola: si alguien agrega otro medio con este
    // defecto y olvida el flag, el comportamiento es el de siempre, no uno silenciosamente
    // distinto.
    vi.stubGlobal('fetch', vi.fn(async () => respuestaXml(FEED_ENLACE_EN_TITULO)))

    const items = await crearFuenteRss().obtener(MEDIO)

    expect(items).toHaveLength(2)
    expect(items[0].url).toContain('%3Ca')
  })
})
