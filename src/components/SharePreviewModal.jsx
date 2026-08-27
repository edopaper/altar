// Confirmación visual previa a compartir: muestra una captura de la escena
// tal como está ahora, para revisar el encuadre antes de publicar. Recién
// al confirmar se llama a la Edge Function (o se reusa el link cacheado).
export default function SharePreviewModal({ image, onConfirm, onClose }) {
  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form publish-form" onClick={(e) => e.stopPropagation()}>
        <h2>¿Así se ve tu altar?</h2>
        <img className="share-preview-img" src={image} alt="Vista previa del altar" />
        <p className="publish-note">
          Quien abra tu enlace va a ver el altar así como está ahora. Podés cancelar y seguir acomodando.
        </p>
        <div className="shape-row message-actions">
          <button className="btn btn--block" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn--block btn--primary" onClick={onConfirm}>
            Compartir
          </button>
        </div>
      </div>
    </div>
  )
}
