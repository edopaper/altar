import Modal from './Modal.jsx'
import { useState } from 'react'
import { reportMessage } from '../messages.js'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

/** Overlay con la lista completa de mensajes del altar, cada uno con su propio botón de reporte. */
export default function MessageList({ messages, onClose, loading = false, loadError = '', hasMore = false, onLoadMore, onRefresh }) {
  const [reportedIds, setReportedIds] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const handleReport = async (id) => {
    if (busyId || reportedIds.includes(id)) return
    const confirmed = window.confirm(
      '¿Reportar este mensaje por contenido inapropiado? Un equipo lo va a revisar.'
    )
    if (!confirmed) return

    setBusyId(id)
    setError('')
    try {
      await reportMessage(id)
      setReportedIds((prev) => [...prev, id])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal onClose={onClose} label="Mensajes del altar" className="message-list-panel">
        <h2>Mensajes del altar</h2>

        {messages.length === 0 && !loading && !loadError && <p className="admin-empty">Todavía no hay mensajes.</p>}

        {loading && <p role="status">Cargando mensajes…</p>}
        {loadError && <p className="message-error" role="alert">{loadError}</p>}
        <button className="btn" disabled={loading} onClick={onRefresh}>{loadError ? 'Reintentar' : 'Actualizar mensajes'}</button>
        <div className="message-list">
          {messages.map((m) => (
            <div key={m.id} className="message-list-item">
              <div className="message-list-text">
                "{m.text}"
                <span className="message-list-meta">
                  {' '}
                  — {m.author || 'Anónimo'} · {formatDate(m.created_at)}
                </span>
              </div>
              <button
                className="btn message-list-report-btn"
                disabled={busyId === m.id || reportedIds.includes(m.id)}
                onClick={() => handleReport(m.id)}
                title="Reportar este mensaje por contenido inapropiado"
              >
                {reportedIds.includes(m.id) ? 'Reportado' : 'Reportar'}
              </button>
            </div>
          ))}
        </div>

        {hasMore && <button className="btn" disabled={loading} onClick={onLoadMore}>Cargar más mensajes</button>}
        {error && <div className="message-error">{error}</div>}

        <div className="shape-row message-actions">
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
    </Modal>
  )
}
