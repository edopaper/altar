// Bienvenida de primera visita: lo mínimo para no quedarse mirando un
// altar vacío sin saber qué hacer. Se muestra una sola vez (App.jsx guarda
// el flag en localStorage) y se puede cerrar en cualquier momento.
function Icon({ children }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const STEPS = [
  {
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 6.36 15.36" />
        <path d="M18 15v4h-4" />
      </Icon>
    ),
    text: 'Arrastrá para girar la cámara y usá la rueda para acercar o alejar.',
  },
  {
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </Icon>
    ),
    text: 'Elegí un objeto en "Agregar objeto" (abajo, en el menú) para sumarlo al altar.',
  },
  {
    icon: (
      <Icon>
        <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
        <path d="m5 5 3.5 3.5M19 5l-3.5 3.5M5 19l3.5-3.5M19 19l-3.5-3.5" />
      </Icon>
    ),
    text: 'Seleccionalo con click y movelo, rotalo o escalalo con la barra de arriba (o G/R/S).',
  },
  {
    icon: (
      <Icon>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </Icon>
    ),
    text: '¿Te equivocaste? Ctrl+Z deshace el último cambio.',
  },
  {
    icon: (
      <Icon>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
      </Icon>
    ),
    text: 'Cuando esté listo, compartilo con el botón de la esquina del visor.',
  },
]

export default function Onboarding({ onClose }) {
  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form onboarding-form" onClick={(e) => e.stopPropagation()}>
        <h2>Bienvenido a tu altar</h2>
        <ul className="onboarding-steps">
          {STEPS.map((step, i) => (
            <li key={i}>
              <span className="onboarding-icon" aria-hidden="true">{step.icon}</span>
              {step.text}
            </li>
          ))}
        </ul>
        <div className="shape-row message-actions">
          <button className="btn btn--block" onClick={onClose}>
            Entendido, ¡vamos!
          </button>
        </div>
      </div>
    </div>
  )
}
