import { describe, expect, it } from 'vitest'
import { enriquecerNoticia } from '../src/dominio/enriquecimiento.js'

// Fixture con señales fuertes: emergencia + tono negativo + región chilena.
const NOTICIA_EMERGENCIA = {
  id: 'https://www.medio.cl/nota-incendio',
  titular: 'Incendio forestal fuera de control obliga evacuación en Valparaíso',
  url: 'https://www.medio.cl/nota-incendio',
}
const TEXTO_EMERGENCIA =
  'Un incendio forestal fuera de control obligó la evacuación de vecinos. ' +
  'La emergencia mantiene alerta roja en la región de Valparaíso. Bomberos combaten las llamas.'

describe('enriquecerNoticia', () => {
  it('agrega todos los campos de análisis que consume el frontend y el histórico', () => {
    const analisis = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA)
    // El contrato de salida es un objeto con claves en orden fijo: si falta una,
    // el JSON publicado queda incompleto y el frontend/histórico pierden datos.
    expect(Object.keys(analisis)).toEqual([
      'version',
      'sentimiento',
      'polaridad',
      'score',
      'keywords',
      'categorias',
      // Sin 'personas': el análisis dejó de producirlas (política de datos personales,
      // ver dominio/entidades.js). Este contrato es el que impide que vuelvan por
      // descuido.
      'organizaciones',
      'lugares',
      'regiones',
      'comunas',
      'parques',
      'riesgo',
      'prioridad',
      'importancia',
      'tipo',
      'ambito',
      'cantidadPalabras',
      'cantidadParrafos',
      'tiempoLectura',
    ])
    // comunas y parques están reservados (siempre vacíos en la versión actual).
    expect(analisis.comunas).toEqual([])
    expect(analisis.parques).toEqual([])
  })

  it('una emergencia negativa con región produce la cadena coherente riesgo/prioridad/tipo/ámbito', () => {
    const analisis = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA)
    // Los análisis parciales deben quedar conectados entre sí: la categoría de
    // incendio más el sentimiento negativo escalan riesgo y prioridad al máximo.
    expect(analisis.sentimiento).toBe('negativa')
    expect(analisis.categorias).toContain('incendios-forestales')
    expect(analisis.riesgo).toBe('alto')
    expect(analisis.prioridad).toBe(1)
    expect(analisis.tipo).toBe('emergencia')
    // La región chilena detectada manda sobre cualquier otra señal de ámbito.
    expect(analisis.regiones).toContain('valparaiso')
    expect(analisis.ambito).toBe('regional')
  })

  it('no muta la noticia de entrada', () => {
    // El orquestador solo lee la noticia; mutar aquí contaminaría la ventana
    // que luego se persiste tal cual en el JSON publicado.
    const noticia = Object.freeze({ ...NOTICIA_EMERGENCIA })
    const copia = structuredClone(NOTICIA_EMERGENCIA)
    enriquecerNoticia(noticia, TEXTO_EMERGENCIA)
    expect(noticia).toEqual(copia)
  })

  it('con solo el titular como texto disponible igual produce un análisis completo', () => {
    // El re-enriquecimiento sin red trabaja solo con titular+extracto; el
    // orquestador no exige un cuerpo largo para funcionar.
    const analisis = enriquecerNoticia(NOTICIA_EMERGENCIA, NOTICIA_EMERGENCIA.titular)
    expect(analisis).not.toBeNull()
    expect(analisis.tipo).toBe('emergencia')
    expect(analisis.cantidadPalabras).toBeGreaterThan(0)
  })

  it('sin noticia o sin texto devuelve null (fail-open, la noticia se publica sin análisis)', () => {
    expect(enriquecerNoticia(null, TEXTO_EMERGENCIA)).toBeNull()
    expect(enriquecerNoticia(NOTICIA_EMERGENCIA, '')).toBeNull()
    expect(enriquecerNoticia(NOTICIA_EMERGENCIA, null)).toBeNull()
  })

  it('es determinista: la misma entrada produce exactamente la misma salida', () => {
    // Cada corrida del cron re-procesa noticias; sin determinismo habría diffs
    // espurios en la rama data en cada corrida.
    const a = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA)
    const b = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA)
    expect(b).toEqual(a)
  })

  it('estampa la VERSION_ANALISIS de la config en la salida (default 1)', () => {
    // La versión estampada es la que decide si una noticia previa se
    // re-enriquece cuando el pipeline cambia (version < VERSION_ANALISIS).
    const sinConfig = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA)
    expect(sinConfig.version).toBe(1)
    const conConfig = enriquecerNoticia(NOTICIA_EMERGENCIA, TEXTO_EMERGENCIA, { VERSION_ANALISIS: 3 })
    expect(conConfig.version).toBe(3)
  })

  it('el titular entra a la señal de ámbito aunque el cuerpo no lo repita', () => {
    const noticia = {
      id: 'https://www.medio.cl/nota-arg',
      titular: 'Incendio en Argentina moviliza brigadas',
      url: 'https://www.medio.cl/nota-arg',
    }
    // El cuerpo solo no da señal de país; la mención extranjera del titular
    // debe bastar para clasificar la noticia como internacional.
    const analisis = enriquecerNoticia(noticia, 'El operativo continúa según lo previsto.')
    expect(analisis.ambito).toBe('internacional')
  })
})
