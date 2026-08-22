// Modal "Acerca de": qué es el proyecto y crédito de los assets de terceros.
export default function AboutPanel({ onClose }) {
  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form about-form" onClick={(e) => e.stopPropagation()}>
        <h2>Acerca de Altar de Muertos</h2>
        <p>
          Editor 3D para armar y decorar un altar de muertos: agrega modelos, papel
          picado, una fotografía y un mensaje, y comparte el resultado con un enlace.
        </p>
        <p>
          Los modelos 3D provienen de los assets de{' '}
          <a href="https://kenney.nl" target="_blank" rel="noopener noreferrer">
            Kenney (kenney.nl)
          </a>.
        </p>
        <p className="about-credit">@edopaper</p>
        <div className="shape-row message-actions">
          <button className="btn btn--block" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
