import { useState } from 'react'

const SHAPES = [
  { kind: 'cube', label: 'Cubo' },
  { kind: 'sphere', label: 'Esfera' },
  { kind: 'cone', label: 'Prisma' },
]

// Normaliza para comparar sin importar mayúsculas/acentos ("catrina" debe
// encontrar "Catrina", "cráneo" debe encontrar "craneo").
function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Botón de modelo con preview: si el thumbnail (generado por
// scripts/generate-thumbnails.mjs) todavía no existe, la imagen falla en
// silencio y el botón cae de vuelta a mostrar solo el nombre.
function ModelThumbButton({ model, onClick }) {
  const [broken, setBroken] = useState(false)
  return (
    <button className="model-btn" onClick={onClick} title={model.name}>
      {!broken && (
        <img className="model-thumb" src={model.thumbnail} alt="" loading="lazy" onError={() => setBroken(true)} />
      )}
      <span className="model-btn-label">{model.name}</span>
    </button>
  )
}

export default function AltarMenu({
  models,
  categories,
  objects,
  selected,
  snap,
  mode,
  onAddShape,
  onAddModel,
  papers,
  onAddPaper,
  onSelectObject,
  onToggleLock,
  onColorChange,
  onDuplicate,
  onDelete,
  onToggleSnap,
  onClearAltar,
  onModeChange,
  hasPhoto,
  onUploadPhoto,
  onRemovePhoto,
  clothColor,
  onClothColorChange,
  onHide,
  maxObjects,
  objectsWarningAt,
  onShowAbout,
}) {
  const [decorQuery, setDecorQuery] = useState('')
  const decorSearch = normalize(decorQuery.trim())
  const isSearching = decorSearch.length > 0

  const filteredPapers = isSearching
    ? papers.filter((p) => normalize(p.name).includes(decorSearch))
    : papers
  const filteredCategories = isSearching
    ? categories
        .map((cat) => ({ ...cat, models: cat.models.filter((m) => normalize(m.name).includes(decorSearch)) }))
        .filter((cat) => cat.models.length > 0)
    : categories
  const hasDecorResults = filteredPapers.length > 0 || filteredCategories.length > 0

  return (
    <aside className="menu">
      <div className="menu-header">
        <h1 className="menu-title">Altar de Muertos</h1>
        <button className="menu-hide-btn" onClick={onHide} title="Ocultar menú" aria-label="Ocultar menú">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="menu-body">
      <section className="menu-section">
        <h2>
          Objetos en escena ({objects.length}/{maxObjects})
        </h2>
        {objects.length === 0 && <div className="menu-empty">Aún no hay objetos</div>}
        {objects.length >= maxObjects ? (
          <div className="menu-note menu-note--danger">
            Llegaste al máximo de {maxObjects} objetos. Elimina alguno para agregar otro.
          </div>
        ) : (
          objects.length >= objectsWarningAt && (
            <div className="menu-note menu-note--warn">
              Vas en {objects.length} de {maxObjects}: cerca del límite pensado para que el altar siga fluido.
            </div>
          )
        )}
        <ul className="object-list">
          {objects.map((o) => (
            <li key={o.id} className="object-row">
              <button
                className={`object-item ${selected?.id === o.id ? 'object-item--active' : ''}`}
                onClick={() => onSelectObject(o.id)}
              >
                <span className="object-dot" style={{ background: o.type !== 'model' ? o.color : '#8a7fb5' }} />
                {o.name}
              </button>
              <button
                className={`lock-btn ${o.locked ? 'lock-btn--locked' : ''}`}
                onClick={() => onToggleLock(o.id)}
                title={o.locked ? 'Desbloquear' : 'Bloquear'}
                aria-label={o.locked ? `Desbloquear ${o.name}` : `Bloquear ${o.name}`}
              >
                {o.locked ? (
                  // Candado cerrado
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" fill="currentColor" stroke="none" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  // Candado abierto
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="menu-section menu-section--active">
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
          {selected.type !== 'model' && (
            <label className="color-row">
              Color
              <input type="color" value={selected.color} onChange={(e) => onColorChange(e.target.value)} />
            </label>
          )}
          <div className="shape-row">
            <button className="btn" onClick={onDuplicate}>Duplicar</button>
            <button className="btn btn--danger" onClick={onDelete} disabled={selected.locked}>
              Eliminar
            </button>
          </div>
          {selected.locked && (
            <div className="menu-note">Objeto bloqueado: desbloquéalo con el candado para editarlo.</div>
          )}
        </section>
      )}

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
        <div className="menu-label">Decoración ({models.length + papers.length})</div>
        <input
          type="search"
          className="decor-search"
          placeholder="Buscar (ej. catrina, vela, calabaza)…"
          value={decorQuery}
          onChange={(e) => setDecorQuery(e.target.value)}
        />
        <div className="category-list">
          {!hasDecorResults && (
            <div className="menu-empty">Sin resultados para «{decorQuery.trim()}»</div>
          )}
          {filteredPapers.length > 0 && (
            <details className="category" open={isSearching || undefined}>
              <summary className="category-header">
                Papel picado <span className="category-count">{filteredPapers.length}</span>
              </summary>
              <div className="model-grid">
                {filteredPapers.map((p) => (
                  <button key={p.path} className="model-btn" onClick={() => onAddPaper(p)} title={p.name}>
                    <img className="model-thumb" src={p.path} alt="" loading="lazy" />
                    <span className="model-btn-label">{p.name}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
          {filteredCategories.map((cat) => (
            <details key={cat.category} className="category" open={isSearching || undefined}>
              <summary className="category-header">
                {cat.category} <span className="category-count">{cat.models.length}</span>
              </summary>
              <div className="model-grid">
                {cat.models.map((m) => (
                  <ModelThumbButton key={m.path} model={m} onClick={() => onAddModel(m)} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <h2>Fotografía</h2>
        <div className="shape-row">
          <label className="btn photo-upload">
            {hasPhoto ? 'Cambiar foto' : 'Cargar foto'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                onUploadPhoto(e.target.files?.[0])
                e.target.value = '' // permite volver a elegir el mismo archivo
              }}
            />
          </label>
          {hasPhoto && (
            <button className="btn btn--danger" onClick={onRemovePhoto}>
              Quitar
            </button>
          )}
        </div>
        <div className="menu-note">Máx. 5 MB · se ajusta a 512 px conservando proporción</div>
      </section>

      <section className="menu-section">
        <h2>Mantel</h2>
        <label className="color-row">
          Color
          <input type="color" value={clothColor} onChange={(e) => onClothColorChange(e.target.value)} />
        </label>
      </section>

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
        Click: seleccionar · Click fuera: deseleccionar · G/R/S: modo · Esc: soltar · Ctrl+Z: deshacer
      </div>
      <button className="menu-about-link" onClick={onShowAbout}>
        Acerca de
      </button>
      </div>
    </aside>
  )
}
