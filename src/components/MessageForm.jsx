import { useState } from 'react'
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH, saveMessage } from '../messages.js'

/** Overlay para dejar un mensaje corto ligado al altar compartido. */
export default function MessageForm({ slug, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const result = saveMessage(slug, { text, author })
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSaved(result.message)
    onClose()
  }

  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form" onClick={(e) => e.stopPropagation()}>
        <h2>Dejar un mensaje</h2>
        <textarea
          className="message-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
            setError('')
          }}
          placeholder="Un mensaje corto para el altar…"
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          autoFocus
        />
        <div className="message-counter">
          {text.length}/{MAX_MESSAGE_LENGTH}
        </div>
        <input
          className="message-input"
          value={author}
          onChange={(e) => setAuthor(e.target.value.slice(0, MAX_NAME_LENGTH))}
          placeholder="Tu nombre (opcional)"
          maxLength={MAX_NAME_LENGTH}
        />
        {error && <div className="message-error">{error}</div>}
        <div className="shape-row message-actions">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--active" onClick={submit} disabled={!text.trim()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
