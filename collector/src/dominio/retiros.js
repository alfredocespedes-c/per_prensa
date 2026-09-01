// Retiros aplicados: contenido que un medio pidió dejar de listar. Puro, sin I/O.
//
// El filtro vive en DOS capas y las dos hacen falta:
//
//   - LECTURA (backend/app/servicios/retiros.py): hace el retiro inmediato. Sin ella
//     habría que esperar hasta una hora a que corra el recolector.
//   - INGESTA (este módulo): impide que la nota vuelva a entrar. Sin ella, la próxima
//     corrida la reingresaría desde el feed y quedaría archivada de nuevo; el filtro de
//     lectura la seguiría ocultando, pero el sistema estaría almacenando exactamente lo
//     que se pidió no almacenar.
//
// A diferencia de las exclusiones por concepto, un retiro NO es un marcado suave: la
// noticia no entra a la ventana ni se archiva. Es la diferencia entre "el admin no
// quiere ver esto" y "el dueño del contenido pidió que no lo tengamos".

/**
 * @param {{ambito:string, clave:string}[]} retirosAplicados
 * @returns {{estaRetirada(noticia):boolean, total:number}}
 */
export function construirFiltroDeRetiros(retirosAplicados = []) {
  const urls = new Set()
  const medios = new Set()

  for (const retiro of retirosAplicados ?? []) {
    const clave = String(retiro?.clave ?? '').trim()
    if (!clave) continue
    if (retiro.ambito === 'noticia') urls.add(clave)
    else if (retiro.ambito === 'medio') medios.add(clave)
  }

  return {
    total: urls.size + medios.size,

    estaRetirada(noticia) {
      if (!noticia) return false
      // Por id (que es la URL canónica) y por url tal cual: una solicitud puede traer la
      // dirección con parámetros de rastreo que la canonicalización ya quitó.
      if (urls.has(noticia.id) || urls.has(noticia.url)) return true
      return medios.has(noticia.medioId)
    },
  }
}

/**
 * Saca de la ventana las noticias retiradas. Devuelve un array NUEVO: a diferencia del
 * marcado de exclusiones, acá no se muta nada porque no hay estado que conservar — la
 * noticia simplemente deja de existir para el sistema.
 */
export function quitarRetiradas(noticias, filtro) {
  if (!filtro || filtro.total === 0) return noticias ?? []
  return (noticias ?? []).filter((noticia) => !filtro.estaRetirada(noticia))
}
