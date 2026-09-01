import { describe, expect, it, vi } from 'vitest'
import { crearClienteHttp, SinPermiso } from '../src/adaptadores/cliente-http.js'

const UA = 'COIPO_PRENSA/1.0 (monitor de prensa CONAF)'

const respuesta = (url = 'https://medio.cl/nota') => ({ ok: true, status: 200, url })

function politicaFalsa({ permite = () => true } = {}) {
  return {
    puedePedir: vi.fn(async (url) => permite(url)),
    esperarTurno: vi.fn(async () => {}),
  }
}

describe('crearClienteHttp', () => {
  it('consulta robots.txt ANTES de pedir y no llega a la red si prohíbe', async () => {
    // Lo que importa no es que devuelva error, sino que el transporte NO se invoque: una
    // comprobación posterior a la petición no serviría de nada.
    const transporte = vi.fn()
    const politica = politicaFalsa({ permite: () => false })
    const http = crearClienteHttp({ politica, userAgent: UA, transporte })

    await expect(http.pedir('https://medio.cl/nota')).rejects.toBeInstanceOf(SinPermiso)
    expect(transporte).not.toHaveBeenCalled()
  })

  it('espera el turno (Crawl-delay) antes de pedir', async () => {
    const orden = []
    const politica = {
      puedePedir: async () => true,
      esperarTurno: async () => { orden.push('espera') },
    }
    const transporte = vi.fn(async () => { orden.push('pide'); return respuesta() })

    await crearClienteHttp({ politica, userAgent: UA, transporte }).pedir('https://medio.cl/nota')

    expect(orden).toEqual(['espera', 'pide'])
  })

  it('inyecta el User-Agent identificable en toda petición', async () => {
    const transporte = vi.fn(async () => respuesta())
    await crearClienteHttp({ userAgent: UA, transporte }).pedir('https://medio.cl/nota')

    expect(transporte.mock.calls[0][1].headers['user-agent']).toBe(UA)
  })

  it('las cabeceras propias no pueden pisar el User-Agent... pero sí agregar otras', async () => {
    const transporte = vi.fn(async () => respuesta())
    await crearClienteHttp({ userAgent: UA, transporte }).pedir('https://medio.cl/nota', {
      headers: { accept: 'text/html' },
    })

    const enviadas = transporte.mock.calls[0][1].headers
    expect(enviadas['user-agent']).toBe(UA)
    expect(enviadas.accept).toBe('text/html')
  })

  it('sin política configurada, pide sin comprobar nada', async () => {
    // Es el modo de las pruebas herméticas de las fuentes; en producción main.js SIEMPRE
    // inyecta la política.
    const transporte = vi.fn(async () => respuesta())
    await crearClienteHttp({ userAgent: UA, transporte }).pedir('https://medio.cl/nota')
    expect(transporte).toHaveBeenCalledTimes(1)
  })

  it('revalida la URL FINAL tras una redirección', async () => {
    // fetchSeguro sigue las redirecciones revalidando el HOST, pero un salto puede acabar
    // en una ruta que el robots.txt del destino prohíbe. Sin esta comprobación, el
    // contenido se leería igual.
    const politica = politicaFalsa({ permite: (url) => !url.includes('/privado') })
    const transporte = vi.fn(async () => respuesta('https://medio.cl/privado/nota'))
    const http = crearClienteHttp({ politica, userAgent: UA, transporte })

    await expect(http.pedir('https://medio.cl/nota')).rejects.toBeInstanceOf(SinPermiso)
  })

  it('una redirección a una ruta permitida sí devuelve la respuesta', async () => {
    const politica = politicaFalsa()
    const transporte = vi.fn(async () => respuesta('https://medio.cl/nota-final'))
    const http = crearClienteHttp({ politica, userAgent: UA, transporte })

    await expect(http.pedir('https://medio.cl/nota')).resolves.toMatchObject({ ok: true })
  })

  it('el timeout por petición prevalece sobre el del cliente', async () => {
    const transporte = vi.fn(async () => respuesta())
    await crearClienteHttp({ userAgent: UA, transporte, timeoutMs: 20_000 }).pedir(
      'https://medio.cl/nota',
      { timeoutMs: 500 },
    )
    // No se puede leer el valor de un AbortSignal.timeout, pero sí que se pasó una señal.
    expect(transporte.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(transporte.mock.calls[0][1].timeoutMs).toBeUndefined()
  })

  it('SinPermiso lleva la URL rechazada, para que el resumen de la corrida la muestre', async () => {
    const http = crearClienteHttp({
      politica: politicaFalsa({ permite: () => false }),
      userAgent: UA,
      transporte: vi.fn(),
    })

    await expect(http.pedir('https://medio.cl/x')).rejects.toMatchObject({
      name: 'SinPermiso',
      url: 'https://medio.cl/x',
    })
  })
})
