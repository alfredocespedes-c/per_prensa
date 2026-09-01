// Puerto: extractor de contenido. Implementación: adaptadores/extractor-contenido.js
//
// Interfaz: crearExtractorContenido({ timeoutMs, userAgent, cliente }) → extractor
// extractor.obtenerContenido(url) → {texto, autor, fechaPublicacion, cuerpoOmitidoPorMuro} | null
// extractor.estadisticas() → { omitidasPorMuro }
//
// La función NUNCA lanza (fail-open). Devuelve null si hay error.
// texto: string (máx 5000 chars) o string vacío. EFÍMERO: es para detectar la mención y
//        analizar; prohibido asignarlo a un campo de la noticia. Lo único que se persiste
//        del contenido es el extracto acotado (ver dominio/menciones.js).
// autor: string o null. Solo para atribución, y solo en la superficie interna.
// fechaPublicacion: ISO-8601 o null
// cuerpoOmitidoPorMuro: true si el medio declaró que la nota no es de acceso libre.
//
// NO hay campo de imagen, y su ausencia es la medida: el departamento legal resolvió que
// las imágenes de noticias desaparecen de las dos superficies, así que el dato dejó de
// producirse. No reintroducirlo acá ni en el adaptador.

export {}
