// Composición de la purga de retención. Proceso aparte de main.js a propósito.
//
// Uso:
//   node src/purga.js              # SIMULACIÓN: cuenta y reporta, no borra nada
//   node src/purga.js --aplicar    # borra de verdad
//
// El modo por defecto es la simulación, y no al revés, porque un borrado no se deshace:
// si alguien ejecuta esto a mano sin leer la ayuda, lo peor que puede pasar es que vea
// un informe.
//
// Corre en su propio proceso y en su propio horario (ver collector/crontab) para que un
// fallo de la purga no pueda arrastrar a la corrida horaria del boletín. Nunca se
// ejecuta dentro de main.js.

import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { crearPurgadorPostgres } from './adaptadores/purgador-postgres.js'
import {
  POSTGRES_ACTIVO,
  RETENCION_EJECUCIONES_DIAS,
  RETENCION_EXTRACTO_DIAS,
  RETENCION_METADATOS_DIAS,
  TAMANO_LOTE_PURGA,
} from './config/parametros.js'
import { calcularCortes, resumenDePurga } from './dominio/retencion.js'

// Duplicado a propósito de main.js: son dos composiciones independientes y hacer que una
// importe de la otra las acoplaría por la puerta de atrás.
function configPostgresDesdeEnv() {
  return {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  }
}

export async function purgar({ ahora = new Date(), purgador, simulacion } = {}) {
  const inicioMs = Date.now()

  // Se calculan ANTES de conectar: si la configuración de retención es incoherente,
  // esto lanza sin haber tocado la base.
  const { corteExtracto, corteMetadatos, corteEjecuciones } = calcularCortes(ahora, {
    retencionExtractoDias: RETENCION_EXTRACTO_DIAS,
    retencionMetadatosDias: RETENCION_METADATOS_DIAS,
    retencionEjecucionesDias: RETENCION_EJECUCIONES_DIAS,
  })

  const opciones = { tamanoLote: TAMANO_LOTE_PURGA, simulacion }

  // ORDEN IMPORTANTE: primero el texto, después el borrado de filas. Al revés, las filas
  // que cruzan los 400 días se borrarían antes y el contador de extractos purgados
  // mentiría por defecto (habría contado como "purgadas" filas que en realidad se
  // eliminaron enteras).
  const extractosPurgados = await purgador.purgarExtractos(corteExtracto, opciones)
  const noticiasBorradas = await purgador.purgarNoticias(corteMetadatos, opciones)
  const ejecucionesBorradas = await purgador.purgarEjecuciones(corteEjecuciones, opciones)

  const resultado = {
    iniciadaEn: ahora.toISOString(),
    duracionMs: Date.now() - inicioMs,
    exito: true,
    simulacion: Boolean(simulacion),
    diasExtracto: RETENCION_EXTRACTO_DIAS,
    diasMetadatos: RETENCION_METADATOS_DIAS,
    diasEjecuciones: RETENCION_EJECUCIONES_DIAS,
    extractosPurgados,
    noticiasBorradas,
    ejecucionesBorradas,
  }
  resultado.resumen = resumenDePurga(resultado)
  return resultado
}

export async function main() {
  const { values } = parseArgs({ options: { aplicar: { type: 'boolean' } } })
  const simulacion = !values.aplicar

  if (!POSTGRES_ACTIVO) {
    console.error('Sin DATABASE_HOST: no hay base que purgar.')
    process.exitCode = 1
    return
  }

  const purgador = crearPurgadorPostgres(configPostgresDesdeEnv())
  try {
    const resultado = await purgar({ purgador, simulacion })
    console.log(resultado.resumen.join('\n'))

    // El registro va DESPUÉS de imprimir y con su propio try/catch: que no se pueda
    // escribir el log no debe convertir una purga exitosa en una corrida fallida.
    try {
      await purgador.registrarPurga(resultado)
    } catch (error) {
      console.error(`[FALLO] Registro de la purga: ${error.message}`)
    }

    if (simulacion) {
      console.log('Nada se borró. Repetir con --aplicar para ejecutar la purga.')
    }
  } finally {
    await purgador.cerrar()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Error fatal en la purga: ${error.stack ?? error}`)
    process.exitCode = 1
  })
}
