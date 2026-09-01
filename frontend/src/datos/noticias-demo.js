const ahora = Date.now()
const horas = (n) => new Date(ahora - n * 60 * 60 * 1000).toISOString()
const dias = (n, h = 0) => new Date(ahora - (n * 24 + h) * 60 * 60 * 1000).toISOString()

export const seccionesDemo = [
  { id: 'nacional', nombre: 'Prensa nacional', orden: 1 },
  { id: 'regional', nombre: 'Prensa regional', orden: 2 },
  { id: 'digital', nombre: 'Medios digitales', orden: 3 },
  { id: 'radio-tv', nombre: 'Radio y televisión', orden: 4 },
]

export const conceptosDemo = [
  { texto: 'CONAF', orden: 1 },
  { texto: 'Incendios forestales', orden: 2 },
  { texto: 'Bosques y conservación', orden: 3 },
  { texto: 'Áreas silvestres protegidas', orden: 4 },
]

const medios = [
  ['LA TERCERA','nacional'], ['EL MERCURIO','nacional'], ['LAS ÚLTIMAS NOTICIAS','nacional'],
  ['BIOBIOCHILE','digital'], ['EMOL','digital'], ['COOPERATIVA','digital'], ['CNN CHILE','radio-tv'],
  ['24 HORAS','radio-tv'], ['RADIO BÍO BÍO','radio-tv'], ['EL AUSTRAL','regional'],
  ['DIARIO CONCEPCIÓN','regional'], ['EL MERCURIO DE VALPARAÍSO','regional'], ['LA ESTRELLA','regional'],
]

const titulares = {
  'CONAF': [
    'CONAF refuerza coordinación territorial para enfrentar la temporada de mayor riesgo',
    'Nuevo despliegue preventivo pone foco en zonas de interfaz urbano forestal',
    'CONAF y municipios coordinan acciones preventivas en sectores prioritarios',
    'Institución fortalece monitoreo territorial y capacidad de respuesta regional',
    'CONAF presenta nuevas herramientas para informar oportunamente a la ciudadanía',
    'Equipos regionales intensifican actividades de prevención y educación comunitaria',
    'Autoridades revisan disponibilidad de recursos para la temporada forestal',
    'CONAF participa en mesa técnica para fortalecer coordinación ante emergencias',
  ],
  'Incendios forestales': [
    'Autoridades revisan preparación frente a incendios forestales',
    'Región prepara recursos terrestres para enfrentar jornadas de altas temperaturas',
    'Balance regional destaca reducción de emergencias durante la última jornada',
    'Comunidades participan en jornada preventiva sobre incendios forestales',
    'Refuerzan patrullajes preventivos ante condiciones favorables para propagación del fuego',
    'Equipos de emergencia realizan ejercicio de coordinación en zona de interfaz',
    'Prevención de incendios forestales concentra trabajo con comunidades rurales',
    'Llaman a extremar precauciones durante fin de semana de altas temperaturas',
  ],
  'Bosques y conservación': [
    'Restauración y protección de bosque nativo marcan nueva agenda territorial',
    'Especialistas analizan desafíos para la conservación de ecosistemas forestales',
    'Programa de restauración recuperará sectores afectados por incendios anteriores',
    'Comunidades locales participan en iniciativas de conservación del bosque nativo',
    'Proyecto busca fortalecer corredores biológicos en la zona centro sur',
    'Nueva jornada técnica aborda manejo sustentable y recuperación de ecosistemas',
    'Organizaciones impulsan acciones para proteger especies nativas amenazadas',
    'Expertos destacan importancia de la restauración ecológica de largo plazo',
  ],
  'Áreas silvestres protegidas': [
    'Parques nacionales se preparan para recibir visitantes durante la temporada alta',
    'Refuerzan recomendaciones para una visita segura a áreas protegidas',
    'Guardaparques desarrollan operativo preventivo en senderos de alta demanda',
    'Nueva iniciativa busca mejorar experiencia de visitantes en parques nacionales',
    'Autoridades llaman a respetar normas de conservación en reservas nacionales',
    'Programa educativo acerca el trabajo de guardaparques a comunidades escolares',
    'Área protegida incorpora nueva señalética para orientar a sus visitantes',
    'Turismo responsable y conservación marcan agenda de parques nacionales',
  ],
}

const sentimientos = ['positiva','neutra','neutra','positiva','mixta','neutra','negativa']
const ambitos = ['nacional','regional','regional','nacional','regional','nacional']

function extracto(concepto, i) {
  const textos = [
    `La información destaca medidas de coordinación, prevención y seguimiento. ${concepto} aparece entre los principales temas abordados durante la jornada.`,
    `El reporte revisa acciones desarrolladas durante las últimas horas y las prioridades para los próximos días, con especial atención a ${concepto}.`,
    `Autoridades y equipos técnicos entregaron antecedentes sobre el despliegue territorial. La cobertura menciona el trabajo asociado a ${concepto}.`,
    `La jornada reunió a instituciones y comunidades para revisar medidas preventivas y fortalecer la coordinación vinculada a ${concepto}.`,
  ]
  const texto = textos[i % textos.length]
  const pos = texto.indexOf(concepto)
  if (pos < 0) return [{ texto, resaltado: false }]
  return [
    { texto: texto.slice(0, pos), resaltado: false },
    { texto: concepto, resaltado: true },
    { texto: texto.slice(pos + concepto.length), resaltado: false },
  ]
}

const edades = [1,2,3,4,5,6,7,8,9,11,13,15,18,21]

export const noticiasDemo = Array.from({ length: 48 }, (_, i) => {
  const concepto = conceptosDemo[i % conceptosDemo.length].texto
  const [medioNombre, seccionId] = medios[i % medios.length]
  const esHoy = i < 24
  const esAyer = i >= 24 && i < 36
  const fecha = esHoy ? horas(edades[i % edades.length]) : esAyer ? dias(1, i % 8) : dias(2 + (i % 12), i % 6)
  return {
    id: `demo-${String(i + 1).padStart(3, '0')}`,
    conceptoPrincipal: concepto,
    seccionId,
    medioNombre,
    fecha,
    titular: titulares[concepto][i % titulares[concepto].length],
    autor: ['Redacción','Equipo de prensa','Crónica regional','Nacional','Medio Ambiente'][i % 5],
    url: '#',
    analisis: {
      sentimiento: sentimientos[i % sentimientos.length],
      ambito: ambitos[i % ambitos.length],
    },
    extracto: extracto(concepto, i),
  }
})
