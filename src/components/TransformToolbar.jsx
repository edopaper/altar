const MODES = [
  { id: 'translate', label: 'Mover', key: 'G' },
  { id: 'rotate', label: 'Rotar', key: 'R' },
  { id: 'scale', label: 'Escalar', key: 'S' },
]

export default function TransformToolbar({ mode, onModeChange, hasSelection }) {
  return (
    <div className={`toolbar ${hasSelection ? '' : 'toolbar--dim'}`}>
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`toolbar-btn ${mode === m.id ? 'toolbar-btn--active' : ''}`}
          onClick={() => onModeChange(m.id)}
          title={`Atajo: ${m.key}`}
        >
          {m.label} <span className="toolbar-key">{m.key}</span>
        </button>
      ))}
    </div>
  )
}
