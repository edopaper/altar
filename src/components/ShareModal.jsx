import { useState } from 'react'

const SHARE_TEXT = 'Armé mi altar de muertos. Mirá cómo quedó:'

// Iconos monocromos simplificados (no son los logos oficiales pixel a
// pixel, pero se reconocen a simple vista y quedan consistentes con el
// resto de íconos stroke/fill de la app).
const NETWORKS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    href: (url) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.05-1.36A10 10 0 1 0 12 2Zm0 18.2a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-3 .8.8-2.93-.19-.3A8.2 8.2 0 1 1 12 20.2Zm4.52-6.13c-.25-.12-1.46-.72-1.68-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.96-.14.16-.29.18-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.16 1.74 2.65 4.22 3.72.59.25 1.05.4 1.41.51.59.19 1.13.16 1.55.1.47-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 22v-8.4h2.8l.42-3.27h-3.22V8.24c0-.95.26-1.6 1.63-1.6h1.74V3.72C16.56 3.66 15.6 3.6 14.47 3.6c-2.36 0-3.97 1.44-3.97 4.08v2.65H7.7v3.27h2.8V22h3Z" />
      </svg>
    ),
  },
  {
    id: 'x',
    label: 'X',
    href: (url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 3h4.2l4 5.4L16.7 3H20l-6.3 8.3L20.4 21h-4.2l-4.4-5.9L6.4 21H3l6.8-8.9L4 3Z" />
      </svg>
    ),
  },
  {
    id: 'email',
    label: 'Email',
    href: (url) =>
      `mailto:?subject=${encodeURIComponent('Mi altar de muertos')}&body=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3.5 6 8.5 7 8.5-7" />
      </svg>
    ),
  },
]

export default function ShareModal({ url, note, onClose }) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // el navegador bloqueó el portapapeles: el input de abajo permite copiar a mano
    }
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'Mi altar de muertos', text: SHARE_TEXT, url })
    } catch {
      // el usuario canceló el share sheet, o el navegador lo bloqueó: no es un error
    }
  }

  return (
    <div className="message-overlay" onClick={onClose}>
      <div className="message-form share-form" onClick={(e) => e.stopPropagation()}>
        <h2>Compartir altar</h2>
        {note && <p className="share-note">{note}</p>}

        {canNativeShare && (
          <button className="btn btn--block share-native-btn" onClick={nativeShare}>
            Compartir…
          </button>
        )}

        <div className="share-networks">
          {NETWORKS.map((n) => (
            <a
              key={n.id}
              className="share-network-btn"
              href={n.href(url)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Compartir por ${n.label}`}
              aria-label={`Compartir por ${n.label}`}
            >
              {n.icon}
            </a>
          ))}
        </div>

        <div className="share-link-row">
          <input className="share-link-input" value={url} readOnly onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={copy}>
            {copied ? 'Copiado' : 'Copiar'}
          </button>
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
