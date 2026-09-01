// Clasificación de categorías por keywords ponderadas.

import { tokenizar, normalizarPalabra } from './analisis-texto.js'

export const CATEGORIAS_TAXONOMIA = {
  'incendios-forestales': {
    id: 'incendios-forestales',
    nombre: 'Incendios forestales',
    color: '#E0451B',
    keywords: { incendio: 3, fuego: 2, llama: 2, quemazón: 2, siniestro: 2 },
  },
  'emergencias': {
    id: 'emergencias',
    nombre: 'Emergencias',
    color: '#B71C1C',
    keywords: { emergencia: 3, alerta: 2, evacuación: 3, crisis: 2, desastre: 2 },
  },
  'prevención': {
    id: 'prevención',
    nombre: 'Prevención',
    color: '#F07E14',
    keywords: { prevención: 3, prevenir: 2, preparación: 2, capacitación: 1 },
  },
  'quemas-controladas': {
    id: 'quemas-controladas',
    nombre: 'Quemas controladas',
    color: '#D9560B',
    keywords: { quema: 2, controlada: 2, autorización: 1 },
  },
  'normativa-legislativo': {
    id: 'normativa-legislativo',
    nombre: 'Normativa / Legislativo',
    color: '#2456C4',
    keywords: { ley: 2, decreto: 2, normativa: 2, legislación: 1, restricción: 1 },
  },
  'fiscalizacion': {
    id: 'fiscalizacion',
    nombre: 'Fiscalización',
    color: '#14539A',
    keywords: { fiscalización: 2, fiscalizar: 2, multa: 1, sanción: 1 },
  },
  'sbap-ley-21600': {
    id: 'sbap-ley-21600',
    nombre: 'SBAP / Ley 21.600',
    color: '#3B4FD0',
    keywords: { sbap: 2, biodiversidad: 1, especie: 1 },
  },
  'sernafor-transicion': {
    id: 'sernafor-transicion',
    nombre: 'SERNAFOR / Transición',
    color: '#7B3FB0',
    keywords: { sernafor: 2, transición: 1 },
  },
  'institucional-vocerias': {
    id: 'institucional-vocerias',
    nombre: 'Institucional / Vocerías',
    color: '#9227A8',
    keywords: { comunicado: 1, vocería: 2, director: 1, ministra: 1, autoridad: 1 },
  },
  'presupuesto-recursos': {
    id: 'presupuesto-recursos',
    nombre: 'Presupuesto / Recursos',
    color: '#5E35B1',
    keywords: { presupuesto: 2, recursos: 1, fondos: 1, inversión: 1 },
  },
  'manejo-bosques': {
    id: 'manejo-bosques',
    nombre: 'Manejo de bosques / Bosque nativo',
    color: '#166B34',
    keywords: { bosque: 2, manejo: 1, nativo: 1, silvicultura: 1, explotación: 1 },
  },
  'arbolado-urbano': {
    id: 'arbolado-urbano',
    nombre: 'Arbolado urbano / Restauración',
    color: '#63A50E',
    keywords: { arbolado: 2, árbol: 1, plantación: 1, restauración: 2, reforestación: 2 },
  },
  'parques-asp': {
    id: 'parques-asp',
    nombre: 'Parques y ASP',
    color: '#0C8B85',
    keywords: { parque: 1, monumento: 1, reserva: 1, nacional: 1, asp: 1 },
  },
  'educacion-ambiental': {
    id: 'educacion-ambiental',
    nombre: 'Educación ambiental',
    color: '#0277BD',
    keywords: { educación: 1, ambiental: 1, capacitación: 1, conciencia: 1 },
  },
  'comunidades-territorio': {
    id: 'comunidades-territorio',
    nombre: 'Comunidades / Territorio',
    color: '#C25E00',
    keywords: { comunidad: 1, territorio: 1, indígena: 1, pueblo: 1 },
  },
  'otro': {
    id: 'otro',
    nombre: 'Otro',
    color: '#5B6B66',
    keywords: {},
  },
}

export function clasificarCategorias(texto, maxCategorias = 3) {
  if (!texto || typeof texto !== 'string') return []

  const tokens = tokenizar(texto).map((t) => normalizarPalabra(t))
  const puntajes = new Map()

  for (const [catId, catData] of Object.entries(CATEGORIAS_TAXONOMIA)) {
    let puntaje = 0
    for (const token of tokens) {
      for (const [keyword, peso] of Object.entries(catData.keywords)) {
        if (normalizarPalabra(keyword) === token) {
          puntaje += peso
        }
      }
    }
    if (puntaje > 0) {
      puntajes.set(catId, puntaje)
    }
  }

  return [...puntajes.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxCategorias)
    .map(([catId]) => catId)
}
