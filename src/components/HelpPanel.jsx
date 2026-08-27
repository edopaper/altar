// Guía completa de la app, con capturas reales de pantalla (generadas por
// scripts/generate-help-shots.mjs en public/help/). Complementa al
// Onboarding de primera visita: aquello es un resumen de 5 líneas, esto es
// la referencia a la que se vuelve cuando surge una duda.
//
// El width/height de cada captura es su tamaño intrínseco: sirve para que el
// navegador reserve el alto correcto antes de que la imagen (lazy) cargue y
// el texto no salte mientras se lee.

const SECTIONS = [
  {
    title: 'La vista general',
    image: '/help/vista-general.jpg',
    w: 2560,
    h: 1600,
    alt: 'Editor con el menú a la izquierda y el altar en 3D a la derecha',
    points: [
      'A la izquierda está el menú: tus objetos, el catálogo de decoración, la foto y el mantel.',
      'Arrastrá sobre la escena para girar la cámara; la rueda (o pellizco) acerca y aleja.',
      'Los botones flotantes de la derecha: compartir, capturar imagen y la música.',
      'Todo se guarda solo en este navegador: podés cerrar y seguir después.',
    ],
  },
  {
    title: 'Decorá tu altar',
    image: '/help/catalogo.jpg',
    w: 634,
    h: 600,
    alt: 'Catálogo de decoración con chips de categoría y miniaturas',
    points: [
      'Tocá cualquier miniatura del catálogo y el objeto aparece sobre el altar, ya seleccionado.',
      'Los chips (Todo, Comida, Velas…) filtran por categoría; el buscador encuentra por nombre en todo el catálogo.',
      'La barra fina bajo "Objetos en escena" muestra cuánto cupo llevás usado.',
      'También podés cargar una fotografía para el marco y cambiar el color del mantel.',
    ],
  },
  {
    title: 'Mové, rotá y escalá',
    image: '/help/edicion.jpg',
    w: 2560,
    h: 1600,
    alt: 'Objeto seleccionado con flechas de movimiento y panel Seleccionado',
    points: [
      'Click sobre un objeto (en la escena o en la lista) para seleccionarlo: aparecen las flechas para arrastrarlo.',
      'Cambiá de modo con la barra de arriba o el panel "Seleccionado": Mover, Rotar o Escalar.',
      'Desde el panel también podés renombrar, duplicar o eliminar; el candado de la lista bloquea un objeto para no moverlo por accidente.',
      'Shift+click suma objetos a la selección para moverlos o duplicarlos en grupo.',
      '¿Algo salió mal? Ctrl+Z lo deshace (también hay botones ↶/↷ en la barra).',
    ],
  },
  {
    title: 'Compartí tu altar',
    image: '/help/compartir.jpg',
    w: 2560,
    h: 1600,
    alt: 'Confirmación con la vista previa del altar antes de compartir',
    points: [
      'El botón de compartir te muestra primero cómo se ve tu altar; si te gusta, confirmá y se genera un enlace público.',
      'Podés mandarlo por WhatsApp, Facebook, X o email, o copiar el link. Quien lo abra puede recorrer tu altar y dejarte un mensaje.',
      'Si después cambiás algo y volvés a compartir, se actualiza el mismo enlace.',
      'El botón de la cámara descarga una imagen PNG del altar, sin publicar nada.',
    ],
  },
]

const SHORTCUTS = [
  ['G', 'Modo mover'],
  ['R', 'Modo rotar'],
  ['S', 'Modo escalar'],
  ['F', 'Enfocar la cámara en lo seleccionado'],
  ['Esc', 'Soltar la selección'],
  ['Ctrl+Z', 'Deshacer'],
  ['Ctrl+Shift+Z / Ctrl+Y', 'Rehacer'],
  ['Shift+click', 'Selección múltiple'],
]

export default function HelpPanel({ onClose }) {
  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>¿Cómo funciona?</h2>
          <button className="toast-close" onClick={onClose} aria-label="Cerrar ayuda">
            ×
          </button>
        </div>
        <div className="help-body">
          {SECTIONS.map((s) => (
            <section key={s.title} className="help-section">
              <h3>{s.title}</h3>
              <img
                className="help-shot"
                src={s.image}
                width={s.w}
                height={s.h}
                alt={s.alt}
                loading="lazy"
              />
              <ul className="help-points">
                {s.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
          <section className="help-section">
            <h3>Atajos de teclado</h3>
            <table className="help-shortcuts">
              <tbody>
                {SHORTCUTS.map(([keys, desc]) => (
                  <tr key={keys}>
                    <td>
                      <kbd>{keys}</kbd>
                    </td>
                    <td>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="menu-note">En Mac, Cmd funciona igual que Ctrl.</div>
          </section>
        </div>
        <div className="shape-row message-actions">
          <button className="btn btn--block" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
