const CATEGORIAS_COLORES = {
  'incendios-forestales': '#E0451B',
  'emergencias': '#B71C1C',
  'prevención': '#F07E14',
  'quemas-controladas': '#D9560B',
  'normativa-legislativo': '#2456C4',
  'fiscalizacion': '#14539A',
  'sbap-ley-21600': '#3B4FD0',
  'sernafor-transicion': '#7B3FB0',
  'institucional-vacerias': '#9227A8',
  'presupuesto-recursos': '#5E35B1',
  'manejo-bosques': '#166B34',
  'arbolado-urbano': '#63A50E',
  'parques-asp': '#0C8B85',
  'educacion-ambiental': '#0277BD',
  'comunidades-territorio': '#C25E00',
  'otro': '#5B6B66',
}

export default function ChipCategoria({ categoriaId }) {
  if (!categoriaId) return null

  const color = CATEGORIAS_COLORES[categoriaId] || '#5B6B66'
  const etiqueta = categoriaId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '1rem',
        background: `${color}20`,
        color: color,
        fontSize: '0.75rem',
        fontWeight: '500',
        border: `1px solid ${color}40`,
      }}
    >
      {etiqueta}
    </span>
  )
}
