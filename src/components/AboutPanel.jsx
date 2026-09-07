import Modal from './Modal.jsx'
// Modal "Acerca de": qué es el proyecto y crédito de los assets de terceros.
export default function AboutPanel({ onClose }) {
  return (
    <Modal onClose={onClose} label="Acerca de Altar de Muertos" className="message-form about-form">
        <h2>Acerca de Altar de Muertos</h2>
        <p>
          Editor 3D para armar y decorar un altar de muertos: agrega modelos, papel
          picado, una fotografía y un mensaje, y comparte el resultado con un enlace.
        </p>
        <p className="about-credit">Made by @edopaper</p>
        <div className="shape-row message-actions">
          <button className="btn btn--block" onClick={onClose}>
            Cerrar
          </button>
        </div>
    </Modal>
  )
}
