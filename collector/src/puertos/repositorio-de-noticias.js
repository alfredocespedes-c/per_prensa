// Puerto: repositorio del estado de noticias (arquitectura hexagonal).
//
// Un adaptador de este puerto sabe cargar y guardar el estado publicado
// (la ventana de noticias), sin importar dónde viva (archivo JSON, base de
// datos en la v2, memoria en tests).
//
// Contrato:
//
//   cargar() -> Promise<Estado | null>   // null si aún no existe (bootstrap)
//   guardar(estado) -> Promise<void>     // escritura atómica
//
//   Estado: {
//     generadoEn: string,       // ISO-8601 de la última vez que cambió el contenido
//     tamanoVentana: number,
//     secciones: Array<{ id, nombre, orden }>,
//     noticias: Noticia[],      // ver dominio/noticia.js
//   }
//
// Adaptadores existentes: ../adaptadores/repositorio-json.js
// v2: un adaptador de base de datos implementa este mismo contrato sin tocar
// el dominio ni la orquestación (solo la línea de composición en main.js).

export {}
