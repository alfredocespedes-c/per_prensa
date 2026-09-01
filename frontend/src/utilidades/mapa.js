// Escala de color del mapa coroplético.
//
// Cortes FIJOS, no cuantiles: SECOM mira el mapa cada mañana y una leyenda que se
// recalcula sola destruye la comparabilidad entre días (hoy "verde oscuro" son 12
// noticias, mañana 4). Con la ventana habitual (~100 noticias, máximo por región ~25)
// la escalera fija cubre el rango; si la ventana crece, se estira proporcionalmente en
// vez de saturarse.

export function cortesMapa(maximo) {
  if (maximo <= 25) return [2, 5, 10, 20]
  const paso = Math.ceil(maximo / 5)
  return [paso, 2 * paso, 3 * paso, 4 * paso]
}

/** 'n0' (sin noticias) .. 'n5'. n0 es una clase aparte, no "el nivel más bajo". */
export function claseMapa(n, cortes) {
  if (!n) return 'n0'
  for (let i = 0; i < cortes.length; i++) {
    if (n <= cortes[i]) return `n${i + 1}`
  }
  return `n${cortes.length + 1}`
}

/** Etiquetas de la leyenda, derivadas de los cortes reales — nunca escritas a mano. */
export function tramosLeyenda(cortes) {
  const tramos = [{ clase: 'n0', etiqueta: 'Sin noticias' }]
  let desde = 1
  cortes.forEach((corte, i) => {
    tramos.push({
      clase: `n${i + 1}`,
      etiqueta: desde === corte ? `${corte}` : `${desde}–${corte}`,
    })
    desde = corte + 1
  })
  tramos.push({ clase: `n${cortes.length + 1}`, etiqueta: `${desde}+` })
  return tramos
}
