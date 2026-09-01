import { describe, expect, it } from 'vitest'
import { asignarEventos } from '../src/dominio/eventos.js'

const OPCIONES = { umbralEvento: 0.35, ventanaEventoDias: 14, umbralDuplicado: 0.85 }

let contador = 0
function noticia({ id, titular, fecha, eventId, analisis } = {}) {
  contador += 1
  return {
    id: id ?? `https://m.cl/${contador}`,
    titular: titular ?? `Titular ${contador}`,
    fecha: fecha ?? '2026-07-13T10:00:00.000Z',
    fechaDeteccion: fecha ?? '2026-07-13T10:00:00.000Z',
    eventId: eventId ?? null,
    analisis: analisis ?? null,
  }
}

function fechaIso(diasDesdeBase) {
  return new Date(Date.parse('2026-07-01T00:00:00.000Z') + diasDesdeBase * 86_400_000).toISOString()
}

const ANALISIS_INCENDIO = {
  personas: [],
  organizaciones: ['CONAF'],
  categorias: ['incendios-forestales'],
  regiones: ['araucania'],
}

describe('asignarEventos', () => {
  it('agrupa dos noticias similares dentro de la ventana temporal', () => {
    const a = noticia({
      titular: 'Incendio forestal afecta Parque Nacional Conguillío',
      fecha: fechaIso(0),
      analisis: ANALISIS_INCENDIO,
    })
    const b = noticia({
      titular: 'Incendio forestal en Parque Nacional Conguillío sigue activo',
      fecha: fechaIso(1),
      analisis: ANALISIS_INCENDIO,
    })
    const resultado = asignarEventos([a, b], OPCIONES)
    expect(resultado.get(a.id)).toBeTruthy()
    expect(resultado.get(a.id)).toBe(resultado.get(b.id))
  })

  it('no agrupa noticias similares si están fuera de la ventana temporal', () => {
    const a = noticia({
      titular: 'Incendio forestal afecta Parque Nacional Conguillío',
      fecha: fechaIso(0),
      analisis: ANALISIS_INCENDIO,
    })
    const b = noticia({
      titular: 'Incendio forestal en Parque Nacional Conguillío sigue activo',
      fecha: fechaIso(30),
      analisis: ANALISIS_INCENDIO,
    })
    const resultado = asignarEventos([a, b], OPCIONES)
    expect(resultado.has(a.id)).toBe(false)
    expect(resultado.has(b.id)).toBe(false)
  })

  it('una noticia sola nunca queda con eventId', () => {
    const sola = noticia({ titular: 'CONAF presenta plan de reforestación urbana', fecha: fechaIso(0) })
    const otra = noticia({ titular: 'Municipio inaugura nueva plaza en el centro', fecha: fechaIso(0) })
    const resultado = asignarEventos([sola, otra], OPCIONES)
    expect(resultado.has(sola.id)).toBe(false)
    expect(resultado.has(otra.id)).toBe(false)
  })

  it('un eventId ya asignado en una corrida previa nunca se reasigna', () => {
    const previa = noticia({
      id: 'https://m.cl/previa',
      titular: 'Incendio forestal afecta Parque Nacional Conguillío',
      fecha: fechaIso(0),
      analisis: ANALISIS_INCENDIO,
      eventId: 'evt:https://m.cl/semilla-original',
    })
    const nueva = noticia({
      titular: 'Totalmente distinta: comunicado institucional sobre presupuesto',
      fecha: fechaIso(1),
      analisis: { personas: [], organizaciones: [], categorias: ['presupuesto-recursos'], regiones: [] },
    })
    const resultado = asignarEventos([previa, nueva], OPCIONES)
    expect(resultado.get(previa.id)).toBe('evt:https://m.cl/semilla-original')
  })

  it('es determinista sin importar el orden de entrada', () => {
    const a = noticia({
      id: 'https://m.cl/a',
      titular: 'Incendio forestal afecta Parque Nacional Conguillío',
      fecha: fechaIso(0),
      analisis: ANALISIS_INCENDIO,
    })
    const b = noticia({
      id: 'https://m.cl/b',
      titular: 'Incendio forestal en Parque Nacional Conguillío sigue activo',
      fecha: fechaIso(0),
      analisis: ANALISIS_INCENDIO,
    })
    const directo = asignarEventos([a, b], OPCIONES)
    const invertido = asignarEventos([b, a], OPCIONES)
    expect(directo.get(a.id)).toBe(invertido.get(a.id))
    expect(directo.get(b.id)).toBe(invertido.get(b.id))
  })
})
