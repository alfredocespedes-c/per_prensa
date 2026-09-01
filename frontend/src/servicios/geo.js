// Carga de la geometría de las regiones (frontend/public/geo/regiones-chile.v1.json,
// generado por scripts/generar-geo-regiones.mjs).
//
// Caché de promesa a nivel de módulo: /mapa y /regiones comparten una sola descarga y
// navegar entre las dos no vuelve a pedir el archivo. A diferencia de las noticias NO
// lleva `?t=${Date.now()}`: el nombre está versionado y nginx lo sirve `immutable`, así
// que queremos que la caché del navegador funcione.

let promesa = null

export function cargarGeoRegiones() {
  if (!promesa) {
    // BASE_URL y nunca "/geo/...": frontend/Dockerfile expone BASE_PATH como build-arg.
    promesa = fetch(`${import.meta.env.BASE_URL}geo/regiones-chile.v1.json`)
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error(`no se pudo cargar el mapa (HTTP ${respuesta.status})`)
        return respuesta.json()
      })
      .then((geo) => {
        if (!Array.isArray(geo?.features) || geo.features.length !== 16) {
          throw new Error('la geometría de regiones tiene un formato inesperado')
        }
        return geo
      })
      .catch((error) => {
        // Un fallo puntual no debe envenenar la caché: al reintentar se vuelve a pedir.
        promesa = null
        throw error
      })
  }
  return promesa
}
