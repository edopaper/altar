import Modal from './Modal.jsx'

// "1948 — 2021" cuando están las dos fechas; con una sola, la etiqueta
// evita que se lea como un rango incompleto.
function lifespan({ birth, death }) {
  if (birth && death) return `${birth} — ${death}`
  if (birth) return `Nació en ${birth}`
  if (death) return `Partió en ${death}`
  return ''
}

/**
 * Lectura de la dedicatoria en el visor público: retrato, nombre, fechas,
 * biografía y recuerdos. Sin scroll interno propio más allá del panel: la
 * longitud está acotada por los límites de `tribute.js`.
 */
export default function TributePanel({ tribute, photo, altarName, onClose }) {
  const dates = lifespan(tribute)
  const memories = tribute.memories ?? []

  return (
    <Modal onClose={onClose} label="Historia de la persona recordada" className="tribute-panel">
      <div className="tribute-hero">
        <div className="tribute-portrait">
          {photo ? <img src={photo} alt={tribute.personName || 'Retrato'} /> : <span aria-hidden="true">✺</span>}
        </div>
        <p className="menu-eyebrow">En memoria de</p>
        <h2>{tribute.personName || altarName}</h2>
        {dates && <p className="tribute-dates-line">{dates}</p>}
        <span className="tribute-rule" aria-hidden="true">✺</span>
      </div>

      {tribute.bio && <p className="tribute-bio">{tribute.bio}</p>}

      {memories.length > 0 && (
        <section className="tribute-memories">
          <p className="menu-label">Recuerdos</p>
          {memories.map((memory) => (
            <blockquote key={memory.id} className="tribute-memory">
              {memory.text}
            </blockquote>
          ))}
        </section>
      )}

      <div className="shape-row message-actions">
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
