// Test de integridad de la configuración de medios: config/medios.js es la
// "interfaz de administración" v1 (el admin la edita a mano), así que estos
// tests son la red que atrapa un error de tipeo ANTES de que llegue a
// producción y rompa la recolección.
import { describe, expect, it } from 'vitest'
import { MEDIOS, MEDIOS_SITEMAP } from '../src/config/medios.js'
import { validarTipoDeMedio } from '../src/dominio/secciones.js'

function duplicados(valores) {
  const vistos = new Set()
  const repetidos = new Set()
  for (const valor of valores) {
    if (vistos.has(valor)) repetidos.add(valor)
    vistos.add(valor)
  }
  return [...repetidos]
}

describe('integridad de config/medios.js', () => {
  it('los ids son únicos dentro de MEDIOS, dentro de MEDIOS_SITEMAP y entre ambas listas', () => {
    // El id identifica al medio en el JSON publicado y en la caché de estado:
    // un id repetido mezclaría noticias de dos medios distintos.
    expect(duplicados(MEDIOS.map((m) => m.id))).toEqual([])
    expect(duplicados(MEDIOS_SITEMAP.map((m) => m.id))).toEqual([])
    expect(duplicados([...MEDIOS, ...MEDIOS_SITEMAP].map((m) => m.id))).toEqual([])
  })

  it('todo tipo corresponde a una sección real del boletín', () => {
    // Un tipo inexistente dejaría al medio sin sección donde aparecer.
    for (const medio of [...MEDIOS, ...MEDIOS_SITEMAP]) {
      expect(() => validarTipoDeMedio(medio.tipo), `tipo inválido en el medio "${medio.id}"`).not.toThrow()
    }
  })

  it('cada entrada de MEDIOS tiene id, nombre, tipo y feedUrl no vacíos', () => {
    for (const medio of MEDIOS) {
      const contexto = `medio "${medio.id ?? JSON.stringify(medio)}"`
      expect(typeof medio.id === 'string' && medio.id.length > 0, `${contexto}: id vacío`).toBe(true)
      expect(typeof medio.nombre === 'string' && medio.nombre.length > 0, `${contexto}: nombre vacío`).toBe(true)
      expect(typeof medio.tipo === 'string' && medio.tipo.length > 0, `${contexto}: tipo vacío`).toBe(true)
      expect(typeof medio.feedUrl === 'string' && medio.feedUrl.length > 0, `${contexto}: feedUrl vacía`).toBe(true)
    }
  })

  it('cada entrada de MEDIOS_SITEMAP tiene id, nombre, tipo y sitemapUrl no vacíos', () => {
    for (const medio of MEDIOS_SITEMAP) {
      const contexto = `medio "${medio.id ?? JSON.stringify(medio)}"`
      expect(typeof medio.id === 'string' && medio.id.length > 0, `${contexto}: id vacío`).toBe(true)
      expect(typeof medio.nombre === 'string' && medio.nombre.length > 0, `${contexto}: nombre vacío`).toBe(true)
      expect(typeof medio.tipo === 'string' && medio.tipo.length > 0, `${contexto}: tipo vacío`).toBe(true)
      expect(typeof medio.sitemapUrl === 'string' && medio.sitemapUrl.length > 0, `${contexto}: sitemapUrl vacía`).toBe(true)
    }
  })

  it('los ids siguen el formato kebab-case documentado en el propio archivo', () => {
    // El comentario de medios.js pide "kebab-unico": minúsculas, dígitos y
    // guiones. Espacios o mayúsculas delatan una edición a medio hacer.
    for (const medio of [...MEDIOS, ...MEDIOS_SITEMAP]) {
      expect(/^[a-z0-9-]+$/.test(medio.id), `id con formato inválido: "${medio.id}"`).toBe(true)
    }
  })

  it('toda feedUrl y sitemapUrl parsea como URL http(s) absoluta', () => {
    // Una URL malformada haría fallar el fetch de ese medio en cada corrida
    // (y perder sus noticias, uno de los 4 errores inaceptables de SECOM).
    for (const medio of MEDIOS) {
      const url = new URL(medio.feedUrl) // lanza si está malformada
      expect(['http:', 'https:'].includes(url.protocol), `feedUrl no http(s) en "${medio.id}": ${medio.feedUrl}`).toBe(true)
    }
    for (const medio of MEDIOS_SITEMAP) {
      const url = new URL(medio.sitemapUrl)
      expect(['http:', 'https:'].includes(url.protocol), `sitemapUrl no http(s) en "${medio.id}": ${medio.sitemapUrl}`).toBe(true)
    }
  })

  it('no hay URLs de feed/sitemap repetidas (comparación canonicalizada)', () => {
    // Una URL repetida significa descargar y publicar el mismo feed dos veces
    // bajo dos medios distintos (riesgo de duplicados, error inaceptable SECOM).
    // Se canonicaliza (sin barra final) para atrapar también duplicados del
    // estilo ".../feed" vs ".../feed/" — así se colaron en su momento las
    // entradas "pulso" (feed de La Tercera) y "radio-talca" (feed de Diario
    // Talca), ya eliminadas.
    const canonicalizar = (url) => url.replace(/\/+$/, '')
    const porUrl = new Map()
    for (const medio of MEDIOS) {
      const url = canonicalizar(medio.feedUrl)
      porUrl.set(url, [...(porUrl.get(url) ?? []), medio.id])
    }
    for (const medio of MEDIOS_SITEMAP) {
      const url = canonicalizar(medio.sitemapUrl)
      porUrl.set(url, [...(porUrl.get(url) ?? []), medio.id])
    }
    const repetidas = [...porUrl.values()].filter((ids) => ids.length > 1)
    expect(repetidas).toEqual([])
  })
})
