// Etiquetas legibles para los ids que emite el collector. El frontend nunca
// debe derivar texto visible desde un id (split/capitalize pierde tildes y siglas).

export const ETIQUETAS_CATEGORIAS = {
  'incendios-forestales': 'Incendios forestales',
  'emergencias': 'Emergencias',
  'prevención': 'Prevención',
  'quemas-controladas': 'Quemas controladas',
  'normativa-legislativo': 'Normativa / Legislativo',
  'fiscalizacion': 'Fiscalización',
  'sbap-ley-21600': 'SBAP / Ley 21.600',
  'sernafor-transicion': 'SERNAFOR / Transición',
  'institucional-vocerias': 'Institucional / Vocerías',
  // id antiguo con typo, presente en datos anteriores a VERSION_ANALISIS 2
  'institucional-vacerias': 'Institucional / Vocerías',
  'presupuesto-recursos': 'Presupuesto / Recursos',
  'manejo-bosques': 'Manejo de bosques / Bosque nativo',
  'arbolado-urbano': 'Arbolado urbano / Restauración',
  'parques-asp': 'Parques y ASP',
  'educacion-ambiental': 'Educación ambiental',
  'comunidades-territorio': 'Comunidades / Territorio',
  'otro': 'Otro',
}

export const ETIQUETAS_REGIONES = {
  'arica-parinacota': 'Arica y Parinacota',
  'tarapaca': 'Tarapacá',
  'antofagasta': 'Antofagasta',
  'atacama': 'Atacama',
  'coquimbo': 'Coquimbo',
  'valparaiso': 'Valparaíso',
  'metropolitana': 'Metropolitana',
  'ohiggins': "O'Higgins",
  'maule': 'Maule',
  'nuble': 'Ñuble',
  'biobio': 'Biobío',
  'araucania': 'La Araucanía',
  'los-rios': 'Los Ríos',
  'los-lagos': 'Los Lagos',
  'aysen': 'Aysén',
  'magallanes': 'Magallanes',
}

function formatearId(id) {
  return String(id ?? '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function etiquetaCategoria(id) {
  return ETIQUETAS_CATEGORIAS[id] ?? formatearId(id)
}

export function etiquetaRegion(id) {
  return ETIQUETAS_REGIONES[id] ?? formatearId(id)
}
