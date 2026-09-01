// Orquestador de enriquecimiento: coordina todos los análisis.

import { analizarSentimiento } from './sentimiento.js'
import { clasificarCategorias } from './categorias.js'
import { determinarAmbito } from './ambito.js'
import { extraerOrganizaciones } from './entidades.js'
import { detectarRegiones, detectarLugares } from './geografia.js'
import { calcularRiesgo, calcularTipo, calcularPrioridad, calcularImportancia } from './riesgo.js'
import { contarPalabras, contarParrafos, calcularTiempoLectura, extraerKeywords } from './analisis-texto.js'

export function enriquecerNoticia(noticia, texto, config = {}) {
  if (!noticia || !texto) {
    return null
  }

  try {
    const version = config.VERSION_ANALISIS ?? 1

    // 1. Análisis de texto
    const cantidadPalabras = contarPalabras(texto)
    const cantidadParrafos = contarParrafos(texto)
    const tiempoLectura = calcularTiempoLectura(cantidadPalabras)
    const keywords = extraerKeywords(texto, 10)

    // 2. Sentimiento
    const resultadoSentimiento = analizarSentimiento(texto)

    // 3. Categorías
    const categorias = clasificarCategorias(texto, 3)

    // 4. Entidades
    //
    // Las PERSONAS ya no se extraen ni se almacenan. Guardar una lista de nombres
    // propios en el mismo registro que la valoración del tono construye, de hecho, la
    // asociación "esta persona ↔ cobertura negativa", que es exactamente lo que la
    // política de datos personales prohíbe: el tono se atribuye a la NOTICIA, no a las
    // personas que aparecen en ella.
    //
    // Las organizaciones sí se conservan: no son personas naturales y son lo que permite
    // saber de qué instituciones se habla.
    const organizaciones = extraerOrganizaciones(texto, 8)

    // 5. Lugares
    const lugares = detectarLugares(texto, 8)
    const regiones = detectarRegiones(texto, 8)

    // 6. Riesgo, tipo, prioridad
    const riesgo = calcularRiesgo(resultadoSentimiento, categorias)
    const tipo = calcularTipo(resultadoSentimiento, categorias, noticia.titular)
    const prioridad = calcularPrioridad(riesgo, resultadoSentimiento.sentimiento)
    const importancia = calcularImportancia(riesgo, resultadoSentimiento.sentimiento, 1)

    // 7. Ámbito (nacional/regional/internacional): por noticia, no por medio.
    // El titular entra siempre a la señal aunque el cuerpo no lo repita.
    const ambito = determinarAmbito({
      texto: `${noticia.titular}\n${texto}`,
      regiones,
      url: noticia.url,
    })

    // Construir objeto análisis con claves en orden fijo
    const analisis = {
      version,
      sentimiento: resultadoSentimiento.sentimiento,
      polaridad: resultadoSentimiento.polaridad,
      score: resultadoSentimiento.score,
      keywords,
      categorias,
      organizaciones,
      lugares,
      regiones,
      comunas: [],
      parques: [],
      riesgo,
      prioridad,
      importancia,
      tipo,
      ambito,
      cantidadPalabras,
      cantidadParrafos,
      tiempoLectura,
    }

    return analisis
  } catch (error) {
    // Fail-open: si algo falla, devolver null
    console.error(`Error enriqueciendo noticia ${noticia.id}:`, error.message)
    return null
  }
}
