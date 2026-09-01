import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import './ControlTema.css'

// Control de tema, visible en la barra de navegación para TODOS.
//
// El sistema de tema ya existía completo —tokens claros en :root, bloque
// [data-theme='oscuro'], media query prefers-color-scheme, anti-FOUC síncrono en
// index.html y respaldo en main.jsx—, pero el único interruptor vivía en
// /#/configuracion, que exige sesión. Es decir: la portada PÚBLICA se veía oscura o clara
// según el sistema operativo del visitante, sin forma de cambiarlo.
//
// TRES estados, no dos, porque el almacenamiento ya distinguía tres casos y reducirlos a
// dos habría roto uno:
//   · sin clave en localStorage  → seguir al sistema (el estado de fábrica)
//   · 'claro'                    → forzar claro. Es el OPT-OUT de la media query oscura:
//                                  por eso tiene que quedar explícito en el atributo.
//   · 'oscuro'                   → forzar oscuro
const OPCIONES = [
  { id: 'sistema', etiqueta: 'Sistema', Icono: Monitor },
  { id: 'claro', etiqueta: 'Claro', Icono: Sun },
  { id: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
]

export function leerPreferencia() {
  try {
    const guardado = localStorage.getItem('tema')
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema'
  } catch {
    // Safari en navegación privada lanza al tocar localStorage. Preferir el sistema antes
    // que romper la barra entera por una preferencia cosmética.
    return 'sistema'
  }
}

export function aplicarTema(preferencia) {
  const raiz = document.documentElement
  if (preferencia === 'sistema') {
    try {
      localStorage.removeItem('tema')
    } catch { /* sin almacenamiento: el atributo igual manda en esta pestaña */ }
    // Se resuelve a un valor concreto para que el atributo nunca quede a medias, y se
    // deja que la media query gobierne de ahí en adelante.
    const oscuroDelSistema = window.matchMedia('(prefers-color-scheme: dark)').matches
    raiz.setAttribute('data-theme', oscuroDelSistema ? 'oscuro' : 'claro')
    return
  }
  try {
    localStorage.setItem('tema', preferencia)
  } catch { /* idem */ }
  raiz.setAttribute('data-theme', preferencia)
}

export default function ControlTema() {
  const [preferencia, setPreferencia] = useState('sistema')

  useEffect(() => {
    setPreferencia(leerPreferencia())
  }, [])

  // Con la preferencia en «sistema», seguir al sistema EN VIVO: si el usuario cambia el
  // tema del SO con la pestaña abierta, el atributo tiene que acompañarlo. Sin esto, el
  // atributo se queda con el valor que se resolvió al cargar.
  useEffect(() => {
    if (preferencia !== 'sistema') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = (e) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'oscuro' : 'claro')
    }
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [preferencia])

  const elegir = (id) => {
    setPreferencia(id)
    aplicarTema(id)
  }

  return (
    <div className="control-tema" role="group" aria-label="Tema de la interfaz">
      {OPCIONES.map(({ id, etiqueta, Icono }) => (
        <button
          key={id}
          type="button"
          className={`control-tema-boton${preferencia === id ? ' activo' : ''}`}
          onClick={() => elegir(id)}
          // aria-pressed y no solo una clase: sin esto un lector de pantalla anuncia tres
          // botones idénticos y no dice cuál está activo.
          aria-pressed={preferencia === id}
          title={`Tema: ${etiqueta}`}
        >
          <Icono size={16} aria-hidden="true" />
          <span className="control-tema-etiqueta">{etiqueta}</span>
        </button>
      ))}
    </div>
  )
}
