import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './estilos.css'
import App from './App.jsx'

// El tema ya lo fijó el script síncrono del <head> de index.html (tiene que ser ahí:
// este módulo es diferido y correría después del primer pintado, haciendo destellar
// el esqueleto de carga). Se re-aplica acá solo como red de seguridad, por si el
// script del head falló: 'claro' es el opt-out explícito que anula la media query de
// modo oscuro del sistema (ver estilos.css).
if (!document.documentElement.getAttribute('data-theme')) {
  const tema = localStorage.getItem('tema') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro')
  document.documentElement.setAttribute('data-theme', tema)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
