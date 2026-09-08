import { useState } from 'react'
import Modal from './Modal.jsx'
import { TRIBUTE_LIMITS, cleanTribute, isEmptyTribute } from '../../supabase/functions/_shared/tribute.js'

const EMPTY = { personName: '', birth: '', death: '', bio: '', memories: [] }

// El contador aparece recién cerca del límite: mientras sobra espacio no
// tiene sentido poner un número delante de quien está escribiendo.
function Counter({ value, max }) {
  if (value.length < max * 0.7) return null
  return (
    <span className={`tribute-counter ${value.length >= max ? 'tribute-counter--full' : ''}`}>
      {value.length}/{max}
    </span>
  )
}

/**
 * Modal para escribir la dedicatoria: nombre, fechas, biografía breve y
 * recuerdos. Trabaja sobre una copia local y solo confirma al guardar, para
 * que cerrar o cancelar nunca modifique el altar a medias.
 */
export default function TributeEditor({ tribute, photo, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...(tribute ?? {}), memories: (tribute?.memories ?? []).map((m) => ({ ...m })) }))
  const [nextId, setNextId] = useState(() => Math.max(0, ...(tribute?.memories ?? []).map((m) => m.id ?? 0)) + 1)

  const set = (field) => (event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))
  const setMemory = (id, text) =>
    setDraft((prev) => ({ ...prev, memories: prev.memories.map((m) => (m.id === id ? { ...m, text } : m)) }))
  const addMemory = () => {
    setDraft((prev) => ({ ...prev, memories: [...prev.memories, { id: nextId, text: '' }] }))
    setNextId((id) => id + 1)
  }
  const removeMemory = (id) =>
    setDraft((prev) => ({ ...prev, memories: prev.memories.filter((m) => m.id !== id) }))

  const save = () => {
    onSave(cleanTribute(draft))
    onClose()
  }
  const clear = () => {
    onSave(null)
    onClose()
  }

  const full = draft.memories.length >= TRIBUTE_LIMITS.memories

  return (
    <Modal onClose={onClose} label="Dedicatoria del altar" className="tribute-editor">
      <p className="menu-eyebrow">Dedicatoria</p>
      <h2>Su historia</h2>
      <p className="tribute-intro">
        Todo es opcional. Lo que escribas aquí acompaña a la fotografía en el altar compartido.
      </p>

      <div className="tribute-identity">
        <div className="tribute-portrait tribute-portrait--small" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : <span>✺</span>}
        </div>
        <div className="tribute-identity-fields">
          <label className="tribute-field">
            <span>Nombre de la persona</span>
            <input
              value={draft.personName}
              maxLength={TRIBUTE_LIMITS.personName}
              placeholder="María Elena Ruiz"
              onChange={set('personName')}
            />
          </label>
          <div className="tribute-dates">
            <label className="tribute-field">
              <span>Nació</span>
              <input value={draft.birth} maxLength={TRIBUTE_LIMITS.date} placeholder="1948" onChange={set('birth')} />
            </label>
            <label className="tribute-field">
              <span>Partió</span>
              <input value={draft.death} maxLength={TRIBUTE_LIMITS.date} placeholder="2021" onChange={set('death')} />
            </label>
          </div>
        </div>
      </div>

      <label className="tribute-field">
        <span>
          Biografía breve <Counter value={draft.bio} max={TRIBUTE_LIMITS.bio} />
        </span>
        <textarea
          className="message-textarea"
          rows={5}
          value={draft.bio}
          maxLength={TRIBUTE_LIMITS.bio}
          placeholder="Quién fue, de dónde venía, qué la hacía feliz…"
          onChange={set('bio')}
        />
      </label>

      <div className="tribute-memories-head">
        <span className="menu-label">
          Recuerdos ({draft.memories.length}/{TRIBUTE_LIMITS.memories})
        </span>
        <button className="btn" onClick={addMemory} disabled={full}>
          Añadir recuerdo
        </button>
      </div>
      {draft.memories.length === 0 && (
        <div className="menu-empty">Una anécdota, una frase suya, un olor de su cocina.</div>
      )}
      {draft.memories.map((memory, index) => (
        <div key={memory.id} className="tribute-memory-row">
          <label className="tribute-field">
            <span>
              Recuerdo {index + 1} <Counter value={memory.text} max={TRIBUTE_LIMITS.memory} />
            </span>
            <textarea
              className="message-textarea"
              rows={2}
              value={memory.text}
              maxLength={TRIBUTE_LIMITS.memory}
              placeholder="Siempre cantaba mientras hacía el café."
              onChange={(e) => setMemory(memory.id, e.target.value)}
            />
          </label>
          <button
            className="btn btn--danger tribute-memory-remove"
            onClick={() => removeMemory(memory.id)}
            aria-label={`Quitar recuerdo ${index + 1}`}
          >
            Quitar
          </button>
        </div>
      ))}

      <div className="shape-row message-actions">
        <button className="btn btn--primary" onClick={save}>
          Guardar dedicatoria
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        {!isEmptyTribute(tribute) && (
          <button className="btn btn--danger" onClick={clear}>
            Borrar todo
          </button>
        )}
      </div>
    </Modal>
  )
}
