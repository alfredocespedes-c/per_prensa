// Gestión del histórico de noticias.

export function actualizarHistorico(historicoAnterior, noticiasActuales, maxDias = 400) {
  const ahora = new Date()
  const limiteAntiguedad = new Date(ahora.getTime() - maxDias * 24 * 60 * 60 * 1000)

  // Convertir histórico anterior a mapa
  const registrosPrevios = new Map()
  if (historicoAnterior && historicoAnterior.registros) {
    for (const registro of historicoAnterior.registros) {
      const fecha = new Date(registro.fecha)
      if (fecha > limiteAntiguedad) {
        registrosPrevios.set(registro.id, registro)
      }
    }
  }

  // Actualizar con noticias actuales
  for (const noticia of noticiasActuales) {
    const registro = {
      id: noticia.id,
      fecha: noticia.fecha,
      medioId: noticia.medioId,
      seccionId: noticia.seccionId,
      sentimiento: noticia.analisis?.sentimiento ?? null,
      categorias: noticia.analisis?.categorias ?? [],
      regiones: noticia.analisis?.regiones ?? [],
      riesgo: noticia.analisis?.riesgo ?? null,
      eventId: noticia.eventId ?? null,
    }
    registrosPrevios.set(noticia.id, registro)
  }

  // Convertir de vuelta a array, ordenado y filtrado por antigüedad
  const registros = Array.from(registrosPrevios.values())
    .filter((r) => new Date(r.fecha) > limiteAntiguedad)
    .sort((a, b) => {
      const fechaA = new Date(a.fecha)
      const fechaB = new Date(b.fecha)
      return fechaB - fechaA || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    })

  return {
    version: 1,
    registros,
  }
}
