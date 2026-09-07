import Modal from './Modal.jsx'
import { useState } from 'react'
import { MAX_MESSAGE_LENGTH, MAX_NAME_LENGTH, saveMessage } from '../messages.js'

/** Overlay para dejar un mensaje corto ligado al altar compartido. */
export default function MessageForm({ slug, onClose, onSaved }) {
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (sending) return
    setSending(true)
    setError('')
    try {
      const result = await saveMessage(slug, { text, author })
      if (!result.ok) { setError(result.error); return }
      onSaved(result.message)
      onClose()
    } catch {
      setError('No se pudo publicar el mensaje. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal onClose={onClose} label="Dejar un mensaje" className="message-form">
        <h2>Dejar un mensaje</h2>
        <textarea
          aria-label="Mensaje para el altar"
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
          aria-label="Tu nombre (opcional)"
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
          <button className="btn btn--active" onClick={submit} disabled={!text.trim() || sending}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
    </Modal>
  )
}
