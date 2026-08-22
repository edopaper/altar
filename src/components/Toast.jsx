// Notificación flotante no bloqueante (reemplaza los window.alert() de
// compartir). Se autodescarta sola; también se puede cerrar a mano.
export default function Toast({ toast, onClose }) {
  if (!toast) return null

  return (
    <div className={`toast toast--${toast.type}`} role="status">
      <div className="toast-message">{toast.message}</div>
      <button className="toast-close" onClick={onClose} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  )
}
