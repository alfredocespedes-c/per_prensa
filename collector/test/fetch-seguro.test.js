import { afterEach, describe, expect, it, vi } from 'vitest'
import { esIpPrivada, esUrlHttp, fetchSeguro } from '../src/adaptadores/fetch-seguro.js'

// Los tests de fetchSeguro usan SOLO hosts que son IP literal: dns.lookup resuelve una IP
// numérica sin consultar la red, así que la suite es hermética (sin DNS real ni red).

describe('esIpPrivada', () => {
  it('detecta rangos privados/loopback/link-local (v4 y v6)', () => {
    for (const ip of [
      '10.0.0.1', '127.0.0.1', '0.0.0.0', '169.254.169.254', '172.16.0.1', '172.31.255.254',
      '192.168.1.1', '100.64.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1',
    ]) {
      expect(esIpPrivada(ip), ip).toBe(true)
    }
  })

  it('acepta IPs públicas (incluidos los bordes de 172.16/12)', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '203.0.113.5', '2606:4700::1111']) {
      expect(esIpPrivada(ip), ip).toBe(false)
    }
  })
})

describe('esUrlHttp', () => {
  it('solo admite http/https', () => {
    expect(esUrlHttp('http://medio.cl')).toBe(true)
    expect(esUrlHttp('https://medio.cl')).toBe(true)
    expect(esUrlHttp('javascript:alert(1)')).toBe(false)
    expect(esUrlHttp('ftp://medio.cl')).toBe(false)
    expect(esUrlHttp('file:///etc/passwd')).toBe(false)
    expect(esUrlHttp('no-es-url')).toBe(false)
  })
})

describe('fetchSeguro', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('bloquea la IP de metadata cloud ANTES de conectar', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await expect(fetchSeguro('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('host bloqueado')
    expect(f).not.toHaveBeenCalled()
  })

  it('bloquea esquemas no http', async () => {
    await expect(fetchSeguro('file:///etc/passwd')).rejects.toThrow('esquema no permitido')
  })

  it('permite un host público y devuelve la respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const r = await fetchSeguro('http://8.8.8.8/x')
    expect(r.status).toBe(200)
  })

  it('bloquea una REDIRECCIÓN hacia una IP interna (no conecta al interno)', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/' } }))
    vi.stubGlobal('fetch', f)
    await expect(fetchSeguro('http://8.8.8.8/redir')).rejects.toThrow('host bloqueado')
    expect(f).toHaveBeenCalledTimes(1) // conectó al público (302), NO al interno
  })

  it('sigue una redirección hacia otro host público', async () => {
    const f = vi.fn(async (u) =>
      String(u).includes('/redir')
        ? new Response(null, { status: 302, headers: { location: 'http://1.1.1.1/final' } })
        : new Response('final', { status: 200 }),
    )
    vi.stubGlobal('fetch', f)
    const r = await fetchSeguro('http://8.8.8.8/redir')
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('final')
  })
})
