import { Link } from 'react-router-dom'
import { useDatos } from '../contexto/ProveedorDatos.jsx'
import bannerLargo from '../assets/banner-secom.jpg'
import bannerCorto from '../assets/banner-secom-corto.jpg'
import './BannerInstitucional.css'

export const TITULO_BOLETIN = 'Monitor de Prensa CONAF'

const FECHA_LARGA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const FECHA_HORA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// Cabecera institucional: la franja CONAF + UIA + SECOM, a proporción natural y sin
// recorte, con el título del boletín superpuesto sobre el campo plano.
//
// DOS ASSETS, medidos (no heredados). Si alguno cambia, VOLVER A MEDIRLO:
//
//   banner-secom.jpg        3032 x 177  = 17,1299:1   marca+SECOM hasta x=745
//                                                     campo plano #064928: x 850–2745
//   banner-secom-corto.jpg   875 x 177  =  4,9435:1   marca+SECOM hasta x=745
//                                                     termina en #064928 (por eso el
//                                                     contenedor puede continuarlo sin costura)
//
// El asset largo reemplaza al anterior con la MISMA razón (17,1299), así que la matemática
// del piso de altura no cambia. Lo que sí cambió es dónde termina la marca: antes x=540,
// ahora x=745 por el bloque SECOM. El overlay del título arranca después de eso.
//
// OJO con el dispositivo gráfico de la esquina: NO es la bandera de Chile ni un emblema
// nacional. Es un filete decorativo BICOLOR azul+rojo adyacentes, sin banda blanca. Durante
// un tiempo se creyó tricolor y esa premisa falsa blindó el asset contra cualquier recorte.
// Aquí no se recorta nada en horizontal, pero conviene no reintroducir el mito.
//
// POR QUÉ EL TÍTULO NO VA DENTRO DEL BANNER EN MÓVIL: a 390 px el asset largo solo muestra
// las columnas 0–1015 de 3032; como la marca ocupa hasta 745, quedan ~63 px de campo plano.
// No es una preferencia estética, no cabe. Bajo 560 px se usa el asset corto (que muestra la
// marca COMPLETA, hoy imposible con el largo) y el título baja a su propia franja.
//
// El <img> lleva width/height del original para que el navegador reserve espacio antes de
// decodificar: sin eso el contenido salta cuando carga la imagen.
export default function BannerInstitucional() {
  // Los datos salen del contexto y no de props: el banner vive fuera de <Routes>, así que
  // App.jsx no tiene de dónde pasárselos, y el título debe verse en TODAS las vistas —no
  // solo en la portada, que es donde estaba antes la franja blanca de Cabecera.jsx.
  const { generadoEn } = useDatos()
  const fecha = capitalizar(FECHA_LARGA.format(new Date()))
  const actualizado = generadoEn
    ? `Actualizado ${FECHA_HORA.format(new Date(generadoEn)).replace(',', '')} · hora de Chile`
    : null

  return (
    <header className="banner-institucional" role="banner">
      <Link
        to="/"
        className="banner-enlace"
        aria-label="CONAF — Unidad de Información y Análisis, Secretaría de Comunicaciones. Ir al inicio"
      >
        {/* <picture> y no dos <img>: el navegador descarga UNO solo, el que corresponde. */}
        <picture>
          <source media="(max-width: 559.98px)" srcSet={bannerCorto} />
          <img
            className="banner-imagen"
            src={bannerLargo}
            alt="CONAF — Unidad de Información y Análisis · Secretaría de Comunicaciones"
            width="3032"
            height="177"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </Link>

      {/* Superpuesto, NO dentro del <Link>: el banner entero enlaza al inicio, pero el
          título es texto de la página, no parte del nombre accesible del enlace.
          aria-hidden en la fecha no: es información real y se anuncia. */}
      <div className="banner-titulo">
        <p className="banner-titulo-nombre">{TITULO_BOLETIN}</p>
        <p className="banner-titulo-meta">
          {fecha}
          {actualizado && <span className="banner-titulo-sep"> / </span>}
          {actualizado}
        </p>
      </div>
    </header>
  )
}
