// Extracción de organizaciones. Las personas NO se extraen (ver más abajo).

import { tokenizar } from './analisis-texto.js'

const GAZETTEER_ORGANIZACIONES = new Set([
  'conaf',
  'carabineros',
  'fach',
  'armada',
  'senapred',
  'sernafor',
  'minagri',
  'mma',
  'municipalidad',
  'gobernación',
  'intendencia',
  'brigada',
  'cruz',
  'roja',
  'voluntarios',
  'bomberos',
  'tv',
  'cnn',
  'emol',
  'biobio',
  'cooperativa',
  'agencia',
  'onu',
  'unesco',
  'fao',
])

// NO existe extraerPersonas, y su ausencia es la medida, no un olvido.
//
// Extraer nombres de personas y guardarlos en el mismo registro que la valoración del
// tono construye de facto la asociación "esta persona ↔ cobertura negativa". La política
// de datos personales del sistema es que el tono se atribuye a la NOTICIA, nunca a las
// personas que aparecen en ella, así que el dato directamente no se produce: es la única
// forma de que no pueda filtrarse por una vista futura.
//
// (La implementación anterior además estaba rota: comparaba mayúsculas sobre tokens que
// `tokenizar` ya había pasado a minúsculas, así que casi nunca detectaba nada.)
//
// Las organizaciones sí se extraen: no son personas naturales.

export function extraerOrganizaciones(texto, maxOrgs = 8) {
  if (!texto || typeof texto !== 'string') return []

  const tokens = tokenizar(texto)
  const orgs = new Set()

  // Búsqueda simple: palabras capitalizadas en el gazetteer
  for (const token of tokens) {
    const norm = token.toLowerCase()
    if (GAZETTEER_ORGANIZACIONES.has(norm)) {
      orgs.add(token)
    }
  }

  // Búsqueda de siglas (3-5 caracteres, todo mayúsculas)
  const palabras = texto.match(/\b[A-Z]{2,6}\b/g) || []
  for (const palabra of palabras) {
    if (palabra.length <= 6 && !['CL', 'USA', 'UE', 'ONU'].includes(palabra)) {
      orgs.add(palabra)
    }
  }

  return Array.from(orgs)
    .slice(0, maxOrgs)
    .sort()
}
