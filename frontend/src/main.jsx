import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './estilos.css'
import './editorial.css'
import App from './App.jsx'

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
