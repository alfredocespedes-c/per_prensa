// Deduplicación (REQUISITOS.md pregunta 4, supuesto fijado): duplicado es la
// misma noticia dentro del MISMO medio (por URL canónica o por titular
// normalizado). La misma historia en medios distintos se muestra en ambos,
// igual que el boletín antiguo. Conserva la primera aparición.

function normalizarTitular(titular) {
  return titular
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function deduplicar(noticias) {
  const urlsVistas = new Set()
  const titularesVistos = new Set()
  const resultado = []
  for (const noticia of noticias) {
    const clavePorTitular = `${noticia.medioId}|${normalizarTitular(noticia.titular)}`
    if (urlsVistas.has(noticia.id) || titularesVistos.has(clavePorTitular)) continue
    urlsVistas.add(noticia.id)
    titularesVistos.add(clavePorTitular)
    resultado.push(noticia)
  }
  return resultado
}
