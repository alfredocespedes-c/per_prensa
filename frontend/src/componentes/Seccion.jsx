import NoticiaItem from './NoticiaItem.jsx'

export default function Seccion({ seccion, noticias, superficie = 'interna', marcarHoy = true }) {
  if (noticias.length === 0) return null
  return (
    <section className="seccion" aria-label={seccion.nombre}>
      <h2 className="titulo-seccion">
        {seccion.nombre}
        <span className="conteo-seccion">{noticias.length}</span>
      </h2>
      <div className="grilla-noticias">
        {noticias.map((noticia) => (
          <NoticiaItem
            key={noticia.id}
            noticia={noticia}
            superficie={superficie}
            marcarHoy={marcarHoy}
          />
        ))}
      </div>
    </section>
  )
}
