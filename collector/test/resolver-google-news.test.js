import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearResolutorGoogleNews } from '../src/adaptadores/resolver-google-news.js'

// El resolutor depende del endpoint interno NO documentado batchexecute de Google.
// La regla que fijan estos tests: cuando Google cambie el formato (ya pasó una vez),
// resolver() debe devolver null SIN lanzar — el ítem de Google se pierde, la corrida no.

const ENLACE = 'https://news.google.com/rss/articles/CBMiABC123?oc=5'

// La página del artículo trae la firma y el timestamp que exige la llamada interna.
const PAGINA_ARTICULO = '<c-wiz data-n-a-sg="FIRMA-XYZ" data-n-a-ts="1234567"></c-wiz>'

// Respuesta batchexecute real (recortada): prefijo anti-JSON )]}' y la URL del medio
// escapada como / dentro del JSON anidado.
const RESPUESTA_BATCHEXECUTE =
  ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlreq\\",\\"https:\\u002F\\u002Fwww.latercera.com\\u002Fnacional\\u002Fnoticia-conaf\\"]",null,null,null,"generic"]]'

function stubearGoogle({ pagina = PAGINA_ARTICULO, batch = RESPUESTA_BATCHEXECUTE } = {}) {
  const f = vi.fn(async (url) =>
    String(url).includes('batchexecute')
      ? new Response(batch, { status: 200 })
      : new Response(pagina, { status: 200 }),
  )
  vi.stubGlobal('fetch', f)
  return f
}

describe('crearResolutorGoogleNews', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resuelve el enlace cifrado a la URL real del medio (des-escapando \\u002F)', async () => {
    stubearGoogle()
    const resolutor = crearResolutorGoogleNews({ userAgent: 'CoipoBot/1.0' })

    expect(await resolutor.resolver(ENLACE)).toBe('https://www.latercera.com/nacional/noticia-conaf')
  })

  it('envía a batchexecute el id del artículo, la firma y el timestamp como POST urlencoded', async () => {
    const f = stubearGoogle()
    await crearResolutorGoogleNews({ userAgent: 'CoipoBot/1.0' }).resolver(ENLACE)

    const [url, opciones] = f.mock.calls.find(([u]) => String(u).includes('batchexecute'))
    expect(url).toBe('https://news.google.com/_/DotsSplashUi/data/batchexecute')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers['content-type']).toContain('application/x-www-form-urlencoded')
    expect(opciones.headers['user-agent']).toBe('CoipoBot/1.0')
    const cuerpo = decodeURIComponent(opciones.body)
    expect(cuerpo.startsWith('f.req=')).toBe(true)
    expect(cuerpo).toContain('CBMiABC123') // id del artículo (sin la query string ?oc=5)
    expect(cuerpo).toContain('FIRMA-XYZ')
    expect(cuerpo).toContain('1234567')
  })

  it('un enlace sin /articles/ devuelve null sin tocar la red', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)

    expect(await crearResolutorGoogleNews().resolver('https://news.google.com/home')).toBe(null)
    expect(f).not.toHaveBeenCalled()
  })

  it('si la página del artículo ya no trae firma/timestamp (cambio de formato) devuelve null', async () => {
    stubearGoogle({ pagina: '<html>formato nuevo sin data-n-a-sg</html>' })
    expect(await crearResolutorGoogleNews().resolver(ENLACE)).toBe(null)
  })

  it('si batchexecute responde algo sin URL de medio devuelve null sin lanzar', async () => {
    stubearGoogle({ batch: ')]}\'\n\n[["er",null,null,null,null,400,null]]' })
    expect(await crearResolutorGoogleNews().resolver(ENLACE)).toBe(null)
  })

  it('ignora las URLs de news.google.com dentro de la respuesta (no son la URL real)', async () => {
    // Solo aparece Google en la respuesta: no hay URL de medio que devolver.
    stubearGoogle({ batch: ')]}\'\n\n[["x","https://news.google.com/otra-cosa"]]' })
    expect(await crearResolutorGoogleNews().resolver(ENLACE)).toBe(null)
  })

  it('un status de error en cualquiera de las dos llamadas devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bloqueado', { status: 429 })))
    expect(await crearResolutorGoogleNews().resolver(ENLACE)).toBe(null)
  })

  it('un fallo de red devuelve null en vez de propagar (no bota la corrida horaria)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ETIMEDOUT') }))
    await expect(crearResolutorGoogleNews().resolver(ENLACE)).resolves.toBe(null)
  })
})
