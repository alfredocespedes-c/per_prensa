export default function Kpi({ label, valor, subtexto, acento }) {
  return (
    <div
      style={{
        background: 'var(--tarjeta)',
        border: '1px solid var(--linea)',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        minWidth: '200px',
      }}
    >
      <div style={{ fontSize: '0.875rem', color: 'var(--gris-tenue)', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '2rem',
          fontWeight: '600',
          color: acento || 'var(--verde)',
          marginBottom: '0.5rem',
        }}
      >
        {valor}
      </div>
      {subtexto && <div style={{ fontSize: '0.875rem', color: 'var(--gris)' }}>{subtexto}</div>}
    </div>
  )
}
