import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './AltarScene.jsx'
import MusicPlayer from './MusicPlayer.jsx'
import { loadSharedAltar } from '../storage.js'
import { loadMessages } from '../messages.js'
import MessageForm from './MessageForm.jsx'

const noop = () => {}
const IDLE_DELAY_MS = 4000

// Idle a nivel de página: sin actividad unos segundos, la UI se desvanece
// (igual que arranca la órbita automática); reaparece al interactuar.
function useIdle(delayMs) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), delayMs)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), delayMs)
    }
    window.addEventListener('pointerdown', wake)
    window.addEventListener('pointermove', wake)
    window.addEventListener('wheel', wake, { passive: true })
    window.addEventListener('touchstart', wake, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('wheel', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [delayMs])
  return idle
}

/**
 * Visor público de un altar compartido (solo lectura): misma escena que el
 * editor pero sin selección, sin gizmos y sin panel de edición. Sin
 * actividad, la cámara orbita sola y la interfaz se oculta.
 */
export default function AltarViewer({ slug }) {
  const data = useMemo(() => loadSharedAltar(slug), [slug])
  const focusRef = useRef(null)
  const idle = useIdle(IDLE_DELAY_MS)
  // Lectura en un único batch de todos los mensajes ligados a este altar.
  const [messages, setMessages] = useState(() => (data ? loadMessages(slug) : []))
  const [showMessageForm, setShowMessageForm] = useState(false)

  if (!data) {
    return (
      <div className="viewer-missing">
        <h1>Altar no encontrado</h1>
        <p>El enlace no existe o ya no está disponible en este navegador.</p>
        <a className="btn viewer-missing-btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
    )
  }

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 3.2, 5.5], fov: 50 }}>
        <AltarScene
          photo={data.photo}
          objects={data.objects}
          selectedId={null}
          mode="translate"
          snap={false}
          onSelect={noop}
          onTransform={noop}
          focusRef={focusRef}
          autoOrbit
          messages={messages}
        />
      </Canvas>

      <div className={`viewer-ui ${idle ? 'viewer-ui--hidden' : ''}`}>
        <div className="viewer-bar">
          <span className="viewer-title">{data.name}</span>
          <button className="btn" onClick={() => setShowMessageForm(true)}>
            Dejar un mensaje
          </button>
          <a className="btn" href="#/">
            Crear mi propio altar
          </a>
        </div>
        <MusicPlayer />
      </div>

      {showMessageForm && (
        <MessageForm
          slug={slug}
          onClose={() => setShowMessageForm(false)}
          onSaved={(message) => setMessages((prev) => [...prev, message])}
        />
      )}
    </div>
  )
}
