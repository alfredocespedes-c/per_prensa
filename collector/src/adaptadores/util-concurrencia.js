// Ejecuta `fn` sobre cada ítem con un tope de tareas concurrentes.
// Compartido por los adaptadores que hacen varias peticiones de red.
export async function mapaConLimite(items, limite, fn) {
  const resultados = new Array(items.length)
  let siguiente = 0
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const indice = siguiente++
      resultados[indice] = await fn(items[indice], indice)
    }
  })
  await Promise.all(trabajadores)
  return resultados
}
