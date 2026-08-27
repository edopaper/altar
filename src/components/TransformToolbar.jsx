const MODES = [
  { id: 'translate', label: 'Mover', key: 'G' },
  { id: 'rotate', label: 'Rotar', key: 'R' },
  { id: 'scale', label: 'Escalar', key: 'S' },
]

export default function TransformToolbar({
  mode,
  onModeChange,
  hasSelection,
  multiSelect = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) {
  return (
    <div className="toolbar-group">
      <div className="toolbar toolbar--history">
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={onUndo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={onRedo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Shift+Z)"
          aria-label="Rehacer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>
      <div className={`toolbar ${hasSelection ? '' : 'toolbar--dim'}`}>
        {MODES.map((m) => {
          // Con varios objetos seleccionados el gizmo compartido solo mueve
          // (ver GroupTransformControls en AltarScene.jsx): Rotar/Escalar se
          // deshabilitan para no sugerir algo que no hace nada.
          const disabled = multiSelect && m.id !== 'translate'
          return (
            <button
              key={m.id}
              className={`toolbar-btn ${mode === m.id ? 'toolbar-btn--active' : ''}`}
              onClick={() => onModeChange(m.id)}
              disabled={disabled}
              title={disabled ? 'No disponible con varios objetos seleccionados' : `Atajo: ${m.key}`}
            >
              {m.label} <span className="toolbar-key">{m.key}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
