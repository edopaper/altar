const SHAPES = [
  { kind: 'cube', label: 'Cubo' },
  { kind: 'sphere', label: 'Esfera' },
  { kind: 'cone', label: 'Prisma' },
]

export default function AltarMenu({
  models,
  categories,
  objects,
  selected,
  snap,
  mode,
  onAddShape,
  onAddModel,
  onSelectObject,
  onColorChange,
  onDuplicate,
  onDelete,
  onToggleSnap,
  onClearAltar,
  onModeChange,
}) {
  return (
    <aside className="menu">
      <h1 className="menu-title">Altar de Muertos</h1>

      <section className="menu-section">
        <h2>Agregar objeto</h2>
        <div className="menu-label">Forma básica</div>
        <div className="shape-row">
          {SHAPES.map((s) => (
            <button key={s.kind} className="btn" onClick={() => onAddShape(s.kind)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="menu-label">Modelo 3D ({models.length})</div>
        <div className="category-list">
          {categories.map((cat) => (
            <details key={cat.category} className="category">
              <summary className="category-header">
                {cat.category} <span className="category-count">{cat.models.length}</span>
              </summary>
              <div className="model-grid">
                {cat.models.map((m) => (
                  <button key={m.path} className="model-btn" onClick={() => onAddModel(m)} title={m.name}>
                    {m.name}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <h2>Objetos en escena ({objects.length})</h2>
        {objects.length === 0 && <div className="menu-empty">Aún no hay objetos</div>}
        <ul className="object-list">
          {objects.map((o) => (
            <li key={o.id}>
              <button
                className={`object-item ${selected?.id === o.id ? 'object-item--active' : ''}`}
                onClick={() => onSelectObject(o.id)}
              >
                <span className="object-dot" style={{ background: o.type === 'shape' ? o.color : '#8a7fb5' }} />
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="menu-section">
          <h2>Seleccionado: {selected.name}</h2>
          <div className="shape-row">
            <button className={`btn ${mode === 'translate' ? 'btn--active' : ''}`} onClick={() => onModeChange('translate')}>
              Mover
            </button>
            <button className={`btn ${mode === 'rotate' ? 'btn--active' : ''}`} onClick={() => onModeChange('rotate')}>
              Rotar
            </button>
            <button className={`btn ${mode === 'scale' ? 'btn--active' : ''}`} onClick={() => onModeChange('scale')}>
              Escalar
            </button>
          </div>
          {selected.type === 'shape' && (
            <label className="color-row">
              Color
              <input type="color" value={selected.color} onChange={(e) => onColorChange(e.target.value)} />
            </label>
          )}
          <div className="shape-row">
            <button className="btn" onClick={onDuplicate}>Duplicar</button>
            <button className="btn btn--danger" onClick={onDelete}>Eliminar</button>
          </div>
        </section>
      )}

      <section className="menu-section">
        <label className="snap-row">
          <input type="checkbox" checked={snap} onChange={onToggleSnap} />
          Snap a rejilla (0.1 u / 15°)
        </label>
        <button className="btn btn--danger btn--block" onClick={onClearAltar} disabled={objects.length === 0}>
          Limpiar altar
        </button>
        <div className="menu-note">La escena se guarda sola en este navegador.</div>
      </section>

      <div className="menu-hint">
        Click: seleccionar · Click fuera: deseleccionar · G/R/S: modo · Esc: soltar
      </div>
    </aside>
  )
}
