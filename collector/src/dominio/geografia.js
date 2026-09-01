// Detección de regiones y lugares geográficos.

import { tokenizar, normalizarPalabra } from './analisis-texto.js'

export const REGIONES_CHILE = [
  { id: 'arica-parinacota', nombre: 'Arica y Parinacota', capital: 'arica', gentilicios: ['ariqueño'] },
  { id: 'tarapaca', nombre: 'Tarapacá', capital: 'iquique', gentilicios: ['tarapaqueño'] },
  { id: 'antofagasta', nombre: 'Antofagasta', capital: 'antofagasta', gentilicios: ['antofagastino'] },
  { id: 'atacama', nombre: 'Atacama', capital: 'copiapó', gentilicios: ['atacameño'] },
  { id: 'coquimbo', nombre: 'Coquimbo', capital: 'la serena', gentilicios: ['coquimbano', 'serenense'] },
  { id: 'valparaiso', nombre: 'Valparaíso', capital: 'valparaíso', gentilicios: ['porteño', 'valparaisino'] },
  { id: 'metropolitana', nombre: 'Metropolitana', capital: 'santiago', gentilicios: ['santiaguino'] },
  { id: 'ohiggins', nombre: "O'Higgins", capital: 'rancagua', gentilicios: ['rancagüino'] },
  { id: 'maule', nombre: 'Maule', capital: 'talca', gentilicios: ['maulino', 'talquino'] },
  { id: 'nuble', nombre: 'Ñuble', capital: 'chillan', gentilicios: ['chillanejo'] },
  { id: 'biobio', nombre: 'Biobío', capital: 'concepción', gentilicios: ['biobiano', 'penquista'] },
  { id: 'araucania', nombre: 'La Araucanía', capital: 'temuco', gentilicios: ['araucanía', 'temuquino'] },
  { id: 'los-rios', nombre: 'Los Ríos', capital: 'valdivia', gentilicios: ['valdiviano'] },
  { id: 'los-lagos', nombre: 'Los Lagos', capital: 'puerto montt', gentilicios: ['llanquihue'] },
  { id: 'aysen', nombre: 'Aysén', capital: 'coyhaique', gentilicios: ['aysenino'] },
  { id: 'magallanes', nombre: 'Magallanes', capital: 'punta arenas', gentilicios: ['magallánico'] },
]

function normalizarRegion(texto) {
  const norm = normalizarPalabra(texto)
  for (const region of REGIONES_CHILE) {
    if (norm === normalizarPalabra(region.nombre)) return region.id
    if (norm === normalizarPalabra(region.capital)) return region.id
    for (const gentilicio of region.gentilicios) {
      if (norm === normalizarPalabra(gentilicio)) return region.id
    }
  }
  return null
}

export function detectarRegiones(texto, maxRegiones = 8) {
  if (!texto || typeof texto !== 'string') return []

  const tokens = tokenizar(texto)
  const regionesDetectadas = new Set()

  for (const token of tokens) {
    const regionId = normalizarRegion(token)
    if (regionId) {
      regionesDetectadas.add(regionId)
    }
  }

  return Array.from(regionesDetectadas)
    .slice(0, maxRegiones)
    .sort()
}

export function detectarLugares(texto, maxLugares = 8) {
  if (!texto || typeof texto !== 'string') return []

  // Búsqueda simple de palabras capitalizadas (posibles lugares geográficos)
  const palabras = texto.match(/\b([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)*)\b/g) || []
  const lugares = new Set()

  for (const palabra of palabras) {
    // Filtrar palabras de uso general
    if (['CONAF', 'Parque', 'Reserva', 'Monumento', 'Nacional', 'Regional'].includes(palabra)) {
      continue
    }
    // Conservar lugares con nombre + adjunto (p.ej. "Parque Nacional Conguillío")
    if (palabra.toLowerCase().includes('parque') || palabra.toLowerCase().includes('reserva')) {
      lugares.add(palabra)
    }
  }

  return Array.from(lugares)
    .slice(0, maxLugares)
    .sort()
}
