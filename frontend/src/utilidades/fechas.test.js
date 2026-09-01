// Tests de caracterización del formateo de fechas.
// Regla de negocio: todo lo visible se expresa en el día/hora de Chile
// (America/Santiago), sin depender de la zona horaria del navegador.

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  formatoFechaCorta,
  formatoHora,
  hace,
  esHoy,
  esHoyOAyer,
  tiempoRelativo,
} from './fechas.js'

// Enero: Chile en horario de verano (UTC-3), offset inequívoco.
const AHORA = '2026-01-15T12:00:00Z' // 15 ene 2026, 09:00 en Chile

afterEach(() => {
  vi.useRealTimers()
})

function congelarAhora(iso = AHORA) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

describe('formatoFechaCorta / formatoHora', () => {
  it('convierte un instante UTC a la hora de Chile', () => {
    // Se fija la conversión de zona (12:00Z ⇒ 09:00 en Chile), no el render
    // 12/24 h, que depende de la versión de ICU (aquí es-CL sale "09:00 a. m.").
    expect(formatoHora('2026-01-15T12:00:00Z')).toContain('09:00')
    expect(formatoFechaCorta('2026-01-15T12:00:00Z')).toBe('15-01-2026')
  })

  it('un instante UTC de madrugada cae en el día anterior de Chile', () => {
    // 15 ene 02:00Z = 14 ene 23:00 en Chile: el día visible es el 14.
    expect(formatoFechaCorta('2026-01-15T02:00:00Z')).toBe('14-01-2026')
  })
})

describe('hace', () => {
  it('escala de segundos a minutos, horas y días según la antigüedad', () => {
    congelarAhora()
    expect(hace('2026-01-15T11:59:30Z')).toBe('hace unos segundos')
    expect(hace('2026-01-15T11:30:00Z')).toBe('hace 30 min')
    expect(hace('2026-01-15T09:00:00Z')).toBe('hace 3 h')
    expect(hace('2026-01-13T12:00:00Z')).toBe('hace 2 d')
  })

  it('a partir de 7 días abandona lo relativo y muestra la fecha corta', () => {
    congelarAhora()
    expect(hace('2026-01-05T12:00:00Z')).toBe('05-01-2026')
  })
})

describe('esHoy / esHoyOAyer', () => {
  it('compara por día calendario de Chile, no por ventana de 24 horas', () => {
    congelarAhora() // hoy en Chile: 15 ene
    // 15 ene 02:00Z es 14 ene en Chile ⇒ no es "hoy" aunque hayan pasado <24 h.
    expect(esHoy('2026-01-15T02:00:00Z')).toBe(false)
    expect(esHoy('2026-01-15T13:00:00Z')).toBe(true)
    expect(esHoyOAyer('2026-01-15T02:00:00Z')).toBe(true) // ayer en Chile
    expect(esHoyOAyer('2026-01-13T12:00:00Z')).toBe(false) // anteayer
  })
})

describe('tiempoRelativo', () => {
  it('entrada nula o inválida devuelve cadena vacía sin lanzar', () => {
    expect(tiempoRelativo(null)).toBe('')
    expect(tiempoRelativo('')).toBe('')
    expect(tiempoRelativo('no-es-fecha')).toBe('')
  })

  it('dentro del día de hoy (Chile) se expresa en horas', () => {
    congelarAhora()
    expect(tiempoRelativo('2026-01-15T11:30:00Z')).toBe('hace menos de 1 h')
    expect(tiempoRelativo('2026-01-15T11:00:00Z')).toBe('hace 1 h')
    expect(tiempoRelativo('2026-01-15T08:00:00Z')).toBe('hace 4 h')
  })

  it('si cruzó la medianoche de Chile pero lleva menos de 24 h dice "ayer"', () => {
    congelarAhora() // ahora: 15 ene 09:00 en Chile
    // 14 ene 22:00 en Chile: día anterior, 11 h de diferencia.
    expect(tiempoRelativo('2026-01-15T01:00:00Z')).toBe('ayer')
  })

  it('más atrás cuenta días y luego años', () => {
    congelarAhora()
    expect(tiempoRelativo('2026-01-14T11:00:00Z')).toBe('hace 1 día')
    expect(tiempoRelativo('2026-01-10T12:00:00Z')).toBe('hace 5 días')
    expect(tiempoRelativo('2024-01-10T12:00:00Z')).toBe('hace 2 años')
  })
})
