import { useEffect, useState } from 'react'

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

// Botón de decoración con preview: si el thumbnail (generado por
// scripts/generate-thumbnails.mjs) todavía no existe, la imagen falla en
// silencio y el botón cae de vuelta a mostrar solo el nombre.
function DecorThumbButton({ item }) {
  const [broken, setBroken] = useState(false)
  return (
    <button className="model-btn" onClick={item.add} title={`Agregar ${item.name} al altar`}>
      {!broken && (
        <img className="model-thumb" src={item.thumb} alt="" loading="lazy" onError={() => setBroken(true)} />
      )}
      <span className="model-btn-label">{item.name}</span>
    </button>
  )
}

const NAME_MAX_LENGTH = 40

// Input de nombre del objeto seleccionado: estado local para no reescribir
// el objeto en cada tecla, se confirma con Enter/blur y se sincroniza de
// nuevo si se selecciona otro objeto (key={selected.id} desde el caller).
function RenameField({ id, name, onRename }) {
  const [value, setValue] = useState(name)

  useEffect(() => setValue(name), [name])

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== name) onRename(id, trimmed)
    else setValue(name) // vacío o sin cambios: vuelve al nombre actual
  }

  return (
    <input
      className="rename-input"
      value={value}
      maxLength={NAME_MAX_LENGTH}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setValue(name)
          e.currentTarget.blur()
        }
      }}
      aria-label="Nombre del objeto"
    />
  )
}

export default function AltarMenu({
  categories,
  objects,
  selected,
  selectedIds = [],
  selectedObjects = [],
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
  onDuplicateSelected,
  onDeleteSelected,
  onRename,
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
  onShowHelp,
}) {
  const [decorQuery, setDecorQuery] = useState('')
  // Chip de categoría activo: 'all' muestra todo el catálogo agrupado.
  const [activeGroup, setActiveGroup] = useState('all')
  const decorSearch = normalize(decorQuery.trim())
  const isSearching = decorSearch.length > 0

  // Catálogo unificado (papel picado + modelos) en grupos con la misma
  // forma, para renderizar chips y cuadrículas de manera homogénea. Un
  // grupo sin elementos (ej. sin archivos de papel picado) no aparece.
  const decorGroups = [
    {
      id: 'papel',
      label: 'Papel picado',
      items: papers.map((p) => ({ key: p.path, thumb: p.path, name: p.name, add: () => onAddPaper(p) })),
    },
    ...categories.map((cat) => ({
      id: cat.category,
      label: cat.category,
      items: cat.models.map((m) => ({ key: m.path, thumb: m.thumbnail, name: m.name, add: () => onAddModel(m) })),
    })),
  ].filter((g) => g.items.length > 0)
  const totalDecor = decorGroups.reduce((n, g) => n + g.items.length, 0)

  // Al buscar se recorre todo el catálogo (el chip activo se ignora para no
  // esconder resultados); sin búsqueda, el chip decide qué grupos se ven.
  const visibleGroups = decorGroups
    .filter((g) => isSearching || activeGroup === 'all' || g.id === activeGroup)
    .map((g) =>
      isSearching ? { ...g, items: g.items.filter((it) => normalize(it.name).includes(decorSearch)) } : g,
    )
    .filter((g) => g.items.length > 0)
  const hasDecorResults = visibleGroups.length > 0

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
        <div
          className="quota-bar"
          role="progressbar"
          aria-label="Cupo de objetos usado"
          aria-valuemin={0}
          aria-valuemax={maxObjects}
          aria-valuenow={objects.length}
        >
          <div
            className={`quota-bar-fill ${
              objects.length >= maxObjects
                ? 'quota-bar-fill--danger'
                : objects.length >= objectsWarningAt
                  ? 'quota-bar-fill--warn'
                  : ''
            }`}
            style={{ width: `${Math.min(100, (objects.length / maxObjects) * 100)}%` }}
          />
        </div>
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
        {selectedIds.length > 1 && (
          <div className="menu-note">
            {selectedIds.length} objetos seleccionados. Shift/Ctrl/Cmd+clic para sumar o quitar de la selección.
          </div>
        )}
        <ul className="object-list">
          {objects.map((o) => (
            <li key={o.id} className="object-row">
              <button
                className={`object-item ${selectedIds.includes(o.id) ? 'object-item--active' : ''}`}
                onClick={(e) => onSelectObject(o.id, e.shiftKey || e.ctrlKey || e.metaKey)}
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

      {selectedIds.length > 1 && (
        <section className="menu-section menu-section--active">
          <h2>{selectedIds.length} seleccionados</h2>
          <div className="menu-note">
            Arrastra el gizmo en la escena para moverlos juntos, manteniendo sus posiciones relativas.
          </div>
          <div className="shape-row">
            <button className="btn" onClick={onDuplicateSelected}>Duplicar todos</button>
            <button
              className="btn btn--danger"
              onClick={onDeleteSelected}
              disabled={selectedObjects.every((o) => o.locked)}
            >
              Eliminar todos
            </button>
          </div>
        </section>
      )}

      {selected && (
        <section className="menu-section menu-section--active">
          <h2>Seleccionado</h2>
          <RenameField key={selected.id} id={selected.id} name={selected.name} onRename={onRename} />
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
        <h2>Decoración ({totalDecor})</h2>
        <div className="menu-note decor-hint">Toca una miniatura para sumarla al altar.</div>
        <input
          type="search"
          className="decor-search"
          placeholder="Buscar (ej. catrina, vela, calabaza)…"
          value={decorQuery}
          onChange={(e) => setDecorQuery(e.target.value)}
        />
        <div className="decor-chips" aria-label="Categorías de decoración">
          <button
            className={`decor-chip ${activeGroup === 'all' && !isSearching ? 'decor-chip--active' : ''}`}
            aria-pressed={activeGroup === 'all' && !isSearching}
            onClick={() => setActiveGroup('all')}
            disabled={isSearching}
          >
            Todo
          </button>
          {decorGroups.map((g) => (
            <button
              key={g.id}
              className={`decor-chip ${activeGroup === g.id && !isSearching ? 'decor-chip--active' : ''}`}
              aria-pressed={activeGroup === g.id && !isSearching}
              onClick={() => setActiveGroup(g.id)}
              disabled={isSearching}
            >
              {g.label} <span className="decor-chip-count">{g.items.length}</span>
            </button>
          ))}
        </div>
        <div className="decor-groups">
          {!hasDecorResults && (
            <div className="menu-empty">Sin resultados para «{decorQuery.trim()}»</div>
          )}
          {visibleGroups.map((g) => (
            <div key={g.id}>
              {(isSearching || activeGroup === 'all') && (
                <div className="decor-group-label">{g.label}</div>
              )}
              <div className="model-grid">
                {g.items.map((it) => (
                  <DecorThumbButton key={it.key} item={it} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="menu-label">Forma básica</div>
        <div className="shape-row">
          {SHAPES.map((s) => (
            <button key={s.kind} className="btn" onClick={() => onAddShape(s.kind)}>
              {s.label}
            </button>
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
        Click: seleccionar · Click fuera: deseleccionar · G/R/S: modo · F: enfocar · Esc: soltar · Ctrl+Z: deshacer
      </div>
      <div className="menu-footer-links">
        <button className="menu-about-link" onClick={onShowHelp}>
          ¿Cómo funciona?
        </button>
        <button className="menu-about-link" onClick={onShowAbout}>
          Acerca de
        </button>
      </div>
      </div>
    </aside>
  )
}
