import { describe, expect, it } from 'vitest'
import {
  CAMPOS_OBSOLETOS,
  canonicalizarUrl,
  crearNoticia,
  limpiarCamposObsoletos,
  parsearFecha,
  sinCamposObsoletos,
} from '../src/dominio/noticia.js'

const MEDIO = { id: 'la-tercera', nombre: 'La Tercera', tipo: 'escrita' }

describe('canonicalizarUrl', () => {
  it('elimina parámetros de rastreo, conservando los demás', () => {
    expect(
      canonicalizarUrl('https://medio.cl/nota?utm_source=rss&utm_medium=feed&id=7'),
    ).toBe('https://medio.cl/nota?id=7')
    expect(canonicalizarUrl('https://medio.cl/nota?fbclid=abc123')).toBe(
      'https://medio.cl/nota',
    )
  })

  it('elimina el fragmento', () => {
    expect(canonicalizarUrl('https://medio.cl/nota#comentarios')).toBe('https://medio.cl/nota')
  })

  it('normaliza el slash final (salvo la raíz)', () => {
    expect(canonicalizarUrl('https://medio.cl/nota/')).toBe('https://medio.cl/nota')
    expect(canonicalizarUrl('https://medio.cl/')).toBe('https://medio.cl/')
  })

  it('pone el host en minúsculas', () => {
    expect(canonicalizarUrl('https://Medio.CL/Nota')).toBe('https://medio.cl/Nota')
  })

  it('tres variantes de la misma URL canonicalizan igual', () => {
    const limpia = canonicalizarUrl('https://medio.cl/a/b')
    expect(canonicalizarUrl('https://medio.cl/a/b/')).toBe(limpia)
    expect(canonicalizarUrl('https://medio.cl/a/b?utm_campaign=x#frag')).toBe(limpia)
  })

  it('devuelve el texto tal cual ante una URL inválida', () => {
    expect(canonicalizarUrl('no-es-una-url')).toBe('no-es-una-url')
    expect(canonicalizarUrl(null)).toBe('')
  })

  it('rechaza (cadena vacía) esquemas que no son http/https', () => {
    expect(canonicalizarUrl('javascript:alert(document.cookie)')).toBe('')
    expect(canonicalizarUrl('JavaScript:alert(1)')).toBe('')
    expect(canonicalizarUrl('data:text/html,<script>1</script>')).toBe('')
    expect(canonicalizarUrl('ftp://medio.cl/x')).toBe('')
  })
})

describe('parsearFecha', () => {
  it('convierte fechas RFC-822 de RSS a ISO', () => {
    expect(parsearFecha('Mon, 13 Jul 2026 10:30:00 -0400')).toBe('2026-07-13T14:30:00.000Z')
  })

  it('devuelve null ante valores inválidos', () => {
    expect(parsearFecha('fecha inválida')).toBe(null)
    expect(parsearFecha('')).toBe(null)
    expect(parsearFecha(undefined)).toBe(null)
    expect(parsearFecha(new Date('rota'))).toBe(null)
  })
})

describe('crearNoticia', () => {
  const base = {
    medio: MEDIO,
    titular: '  Incendio controlado  ',
    url: 'https://medio.cl/nota?utm_source=rss',
    fechaMedio: '2026-07-13T10:00:00.000Z',
    fechaDeteccion: '2026-07-13T11:00:00.000Z',
    extracto: [{ texto: 'hola', resaltado: false }],
  }

  it('normaliza titular, usa URL canónica como id y denormaliza el medio', () => {
    const noticia = crearNoticia(base)
    expect(noticia).toMatchObject({
      id: 'https://medio.cl/nota',
      url: 'https://medio.cl/nota?utm_source=rss',
      medioId: 'la-tercera',
      medioNombre: 'La Tercera',
      seccionId: 'escrita',
      titular: 'Incendio controlado',
      fecha: '2026-07-13T10:00:00.000Z',
    })
  })

  it('usa la fecha de detección cuando la del medio falta o es inválida', () => {
    expect(crearNoticia({ ...base, fechaMedio: undefined }).fecha).toBe(
      '2026-07-13T11:00:00.000Z',
    )
    expect(crearNoticia({ ...base, fechaMedio: 'basura' }).fecha).toBe(
      '2026-07-13T11:00:00.000Z',
    )
  })

  it('rechaza ítems sin titular o sin URL', () => {
    expect(crearNoticia({ ...base, titular: '   ' })).toBe(null)
    expect(crearNoticia({ ...base, url: '' })).toBe(null)
  })

  it('rechaza URLs con esquema peligroso (javascript:/data:)', () => {
    expect(crearNoticia({ ...base, url: 'javascript:alert(document.domain)//x' })).toBe(null)
    expect(crearNoticia({ ...base, url: 'data:text/html,<script>alert(1)</script>' })).toBe(null)
  })
})


describe('limpieza de campos obsoletos', () => {
  // Por qué existe: el estado de trabajo (datos/noticias.json) persiste entre corridas y
  // las noticias PREVIAS se releen tal cual. Cortar la producción de `imagen` no la borró
  // de ahí — se reescribía cada hora, y la purga de retención no la tocaba. Verificado
  // sobre `fusionar` antes de escribir esto: la previa salía con su og:image intacto.
  const conImagen = () => ({
    id: 'https://medio.cl/a',
    url: 'https://medio.cl/a',
    titular: 'Nota vieja',
    imagen: 'https://medio.cl/og-image.jpg',
  })

  it('`imagen` está declarada como campo obsoleto', () => {
    expect(CAMPOS_OBSOLETOS).toContain('imagen')
  })

  it('quita el campo y NO toca ningún otro', () => {
    const limpia = sinCamposObsoletos(conImagen())
    expect(limpia).not.toHaveProperty('imagen')
    expect(limpia).toEqual({
      id: 'https://medio.cl/a',
      url: 'https://medio.cl/a',
      titular: 'Nota vieja',
    })
  })

  it('devuelve EL MISMO objeto si no hay nada que limpiar (corre sobre la ventana entera)', () => {
    const limpia = { id: 'x', url: 'https://medio.cl/x', titular: 'T' }
    expect(sinCamposObsoletos(limpia)).toBe(limpia) // identidad, no copia
  })

  it('quita un `imagen: null`: la clave presente ya es el rastro', () => {
    // Un null no es "no hay dato": es una columna que sigue existiendo en el archivo y
    // que delata que el sistema trataba imágenes.
    expect(sinCamposObsoletos({ id: 'x', imagen: null })).not.toHaveProperty('imagen')
  })

  it('cuenta cuántas limpió, para poder reportarlo en el resumen de la corrida', () => {
    const { noticias, limpiadas } = limpiarCamposObsoletos([
      conImagen(),
      { id: 'b', titular: 'Nota nueva' },
      conImagen(),
    ])
    expect(limpiadas).toBe(2)
    expect(noticias.filter((n) => 'imagen' in n)).toHaveLength(0)
    expect(noticias).toHaveLength(3) // no descarta noticias, solo campos
  })

  it('no lanza ante entradas degeneradas', () => {
    expect(limpiarCamposObsoletos(undefined).noticias).toEqual([])
    expect(sinCamposObsoletos(null)).toBe(null)
    expect(sinCamposObsoletos('texto')).toBe('texto')
  })
})
