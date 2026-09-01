// Persistencia en localStorage de todas las noticias vistas.
// Complementa el histórico JSON del collector.

const CLAVE_HISTORICO = 'coipo-historico-local'
// v2: renombra 'ultimalVista' (typo) a 'ultimaVista' y agrega poda por tamaño.
const VERSION = 2
// Tope de registros: ~100 noticias/día ⇒ varios meses de histórico sin acercarse
// al límite de ~5 MB del localStorage.
const MAX_REGISTROS = 2000

function obtenerHistorico() {
  try {
    const datos = localStorage.getItem(CLAVE_HISTORICO)
    if (!datos) return { version: VERSION, noticias: {} }
    const parsed = JSON.parse(datos)
    if (parsed.version === VERSION) return parsed
    if (parsed.version === 1) return migrarV1(parsed)
    return { version: VERSION, noticias: {} }
  } catch {
    return { version: VERSION, noticias: {} }
  }
}

function migrarV1(historico) {
  const noticias = {}
  for (const [id, registro] of Object.entries(historico.noticias ?? {})) {
    const { ultimalVista, ...resto } = registro
    noticias[id] = { ...resto, ultimaVista: registro.ultimaVista ?? ultimalVista ?? registro.primeraVista }
  }
  return { version: VERSION, noticias }
}

function podar(historico) {
  const registros = Object.values(historico.noticias)
  if (registros.length <= MAX_REGISTROS) return historico
  registros.sort((a, b) => new Date(b.ultimaVista) - new Date(a.ultimaVista))
  const noticias = {}
  for (const registro of registros.slice(0, MAX_REGISTROS)) {
    noticias[registro.id] = registro
  }
  return { ...historico, noticias }
}

function guardarHistorico(historico) {
  try {
    localStorage.setItem(CLAVE_HISTORICO, JSON.stringify(historico))
  } catch {
    // Cuota llena: podar agresivamente y reintentar una vez antes de rendirse.
    try {
      const registros = Object.values(historico.noticias)
      registros.sort((a, b) => new Date(b.ultimaVista) - new Date(a.ultimaVista))
      const noticias = {}
      for (const registro of registros.slice(0, Math.floor(MAX_REGISTROS / 2))) {
        noticias[registro.id] = registro
      }
      localStorage.setItem(CLAVE_HISTORICO, JSON.stringify({ ...historico, noticias }))
    } catch (e) {
      console.warn('No se pudo guardar histórico local:', e.message)
    }
  }
}

function camposAnalisis(n) {
  return {
    sentimiento: n.analisis?.sentimiento,
    categorias: n.analisis?.categorias,
    importancia: n.analisis?.importancia,
    riesgo: n.analisis?.riesgo,
  }
}

export function actualizarHistoricoLocal(noticias) {
  if (!noticias?.length) return

  const historico = obtenerHistorico()
  const ahora = new Date().toISOString()

  noticias.forEach(n => {
    const existente = historico.noticias[n.id]
    if (!existente) {
      historico.noticias[n.id] = {
        id: n.id,
        url: n.url,
        medioId: n.medioId,
        medioNombre: n.medioNombre,
        seccionId: n.seccionId,
        titular: n.titular,
        fecha: n.fecha,
        primeraVista: ahora,
        ultimaVista: ahora,
        ...camposAnalisis(n),
      }
    } else {
      existente.ultimaVista = ahora
      // Si la noticia ganó análisis después de entrar al histórico, incorporarlo.
      if (n.analisis && existente.sentimiento == null) {
        Object.assign(existente, camposAnalisis(n))
      }
    }
  })

  guardarHistorico(podar(historico))
}

export function obtenerHistoricoLocal() {
  const historico = obtenerHistorico()
  return Object.values(historico.noticias).sort(
    (a, b) => new Date(b.ultimaVista) - new Date(a.ultimaVista)
  )
}

export function limpiarHistoricoLocal() {
  localStorage.removeItem(CLAVE_HISTORICO)
}
