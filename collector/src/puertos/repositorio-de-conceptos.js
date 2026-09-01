// Puerto: catálogo de conceptos de búsqueda y exclusión (arquitectura hexagonal).
//
// Un adaptador de este puerto sabe de dónde salen los conceptos que el admin
// administra, sin que el dominio ni la orquestación sepan si viven en Postgres, en
// un archivo o en memoria.
//
// Contrato:
//
//   obtener() -> Promise<{ incluir: string[], excluir: string[],
//                          incluirPorPrioridad: string[], descartados: number }>
//   cerrar()  -> Promise<void>
//
// Garantías:
//   - Solo conceptos con activo = true.
//   - Ya SANEADOS por dominio/conceptos.js: normalizados a NFC, sin inválidos, sin
//     duplicados por forma plegada, acotados al máximo. `incluir`/`excluir` vienen
//     ordenados de más largo a más corto (para la alternancia del regex);
//     `incluirPorPrioridad` conserva el orden de creación (para recortar la consulta
//     de Google News sin perder los conceptos más cortos, que son los importantes).
//
// Condiciones que el adaptador NO resuelve y main.js SÍ debe manejar:
//   - `incluir` puede venir VACÍO (tabla vaciada a mano). No es un error del puerto.
//   - obtener() puede LANZAR (base caída, DNS, timeout). main.js debe tratarlo
//     fail-open, con el mismo espíritu que el sumidero de archivado: una línea en
//     lineasResumen y la corrida sigue con la semilla de config/conceptos.js. Un
//     problema de base de datos NUNCA debe dejar sin boletín a las 8:00.
//
// Adaptador existente: ../adaptadores/repositorio-conceptos-postgres.js

export {}
