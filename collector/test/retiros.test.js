import { describe, expect, it } from 'vitest'
import { construirFiltroDeRetiros, quitarRetiradas } from '../src/dominio/retiros.js'

const noticia = (sobrescribe = {}) => ({
  id: 'https://mediouno.cl/nota-1',
  url: 'https://mediouno.cl/nota-1',
  medioId: 'medio-uno',
  titular: 'CONAF anuncia plan',
  ...sobrescribe,
})

describe('construirFiltroDeRetiros', () => {
  it('retira una nota puntual por su URL canónica', () => {
    const filtro = construirFiltroDeRetiros([
      { ambito: 'noticia', clave: 'https://mediouno.cl/nota-1' },
    ])
    expect(filtro.estaRetirada(noticia())).toBe(true)
    expect(filtro.estaRetirada(noticia({ id: 'https://mediouno.cl/nota-2', url: 'https://mediouno.cl/nota-2' }))).toBe(false)
  })

  it('retira un medio completo por su id', () => {
    const filtro = construirFiltroDeRetiros([{ ambito: 'medio', clave: 'medio-uno' }])
    expect(filtro.estaRetirada(noticia())).toBe(true)
    expect(filtro.estaRetirada(noticia({ medioId: 'otro' }))).toBe(false)
  })

  it('compara también contra la url cruda, no solo contra el id canónico', () => {
    // El id es la URL canonicalizada (sin utm_, sin hash, sin barra final). Un medio que
    // copia la dirección desde su navegador manda la cruda; si solo se comparara el id,
    // la solicitud no surtiría efecto y nadie entendería por qué.
    const filtro = construirFiltroDeRetiros([
      { ambito: 'noticia', clave: 'https://mediouno.cl/nota-1?utm_source=x' },
    ])
    expect(
      filtro.estaRetirada(
        noticia({ id: 'https://mediouno.cl/nota-1', url: 'https://mediouno.cl/nota-1?utm_source=x' }),
      ),
    ).toBe(true)
  })

  it('ignora claves vacías o en blanco', () => {
    const filtro = construirFiltroDeRetiros([
      { ambito: 'noticia', clave: '   ' },
      { ambito: 'medio', clave: '' },
      { ambito: 'noticia', clave: null },
    ])
    expect(filtro.total).toBe(0)
    expect(filtro.estaRetirada(noticia())).toBe(false)
  })

  it('sin retiros no filtra nada', () => {
    expect(construirFiltroDeRetiros([]).estaRetirada(noticia())).toBe(false)
    expect(construirFiltroDeRetiros().estaRetirada(noticia())).toBe(false)
  })
})

describe('quitarRetiradas', () => {
  it('saca las retiradas de la ventana', () => {
    const ventana = [
      noticia({ id: 'a', url: 'a', medioId: 'medio-uno' }),
      noticia({ id: 'b', url: 'b', medioId: 'otro' }),
      noticia({ id: 'c', url: 'c', medioId: 'otro' }),
    ]
    const filtro = construirFiltroDeRetiros([
      { ambito: 'medio', clave: 'medio-uno' },
      { ambito: 'noticia', clave: 'c' },
    ])

    expect(quitarRetiradas(ventana, filtro).map((n) => n.id)).toEqual(['b'])
  })

  it('a diferencia de las exclusiones, la noticia NO queda marcada: desaparece', () => {
    // Una exclusión por concepto es reversible y ocupa cupo de ventana; un retiro es la
    // voluntad del dueño del contenido, así que la nota no entra ni se archiva.
    const ventana = [noticia()]
    const filtro = construirFiltroDeRetiros([{ ambito: 'medio', clave: 'medio-uno' }])
    const resultado = quitarRetiradas(ventana, filtro)

    expect(resultado).toHaveLength(0)
    expect(ventana[0].excluida).toBeUndefined()
  })

  it('sin retiros devuelve la misma ventana sin copiar', () => {
    const ventana = [noticia()]
    expect(quitarRetiradas(ventana, construirFiltroDeRetiros([]))).toBe(ventana)
  })
})
