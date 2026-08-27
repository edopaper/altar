import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './AltarScene.jsx'
import MusicPlayer from './MusicPlayer.jsx'
import { loadSharedAltar, reportAltar } from '../storage.js'
import { loadMessages } from '../messages.js'
import { supabase } from '../supabaseClient.js'
import MessageForm from './MessageForm.jsx'
import MessageList from './MessageList.jsx'

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
  const focusRef = useRef(null)
  const idle = useIdle(IDLE_DELAY_MS)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'missing' | 'error'
  const [messages, setMessages] = useState([])
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [showMessageList, setShowMessageList] = useState(false)
  const [reportState, setReportState] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setData(null)

    loadSharedAltar(slug)
      .then(async (altar) => {
        if (cancelled) return
        if (!altar) {
          setStatus('missing')
          return
        }
        if (altar.status === 'hidden') {
          // Oculto al público, pero un admin logueado sí puede previsualizarlo
          // (ej. para revisar un reporte antes de decidir).
          const { data: sessionData } = await supabase.auth.getSession()
          let admin = false
          if (sessionData.session) {
            const { data: adminCheck } = await supabase.rpc('is_admin')
            admin = adminCheck === true
          }
          if (cancelled) return
          if (!admin) {
            setStatus('hidden')
            return
          }
          setData({ ...altar, adminPreview: true })
        } else {
          setData(altar)
        }
        loadMessages(slug).then((msgs) => {
          if (!cancelled) setMessages(msgs)
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  const handleReport = () => {
    if (reportState === 'sending' || reportState === 'sent') return
    const confirmed = window.confirm(
      '¿Reportar este altar por contenido inapropiado? Un equipo lo va a revisar.'
    )
    if (!confirmed) return

    setReportState('sending')
    reportAltar(slug)
      .then(() => setReportState('sent'))
      .catch(() => setReportState('error'))
  }

  if (status === 'loading') {
    return (
      <div className="viewer-missing">
        <h1>Cargando altar…</h1>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="viewer-missing">
        <h1>No se pudo cargar el altar</h1>
        <p>Hubo un problema de conexión. Probá recargar la página.</p>
        <a className="btn viewer-missing-btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
    )
  }

  if (status === 'hidden') {
    return (
      <div className="viewer-missing">
        <h1>Altar no disponible</h1>
        <p>Este altar fue ocultado tras varios reportes y está en revisión.</p>
        <a className="btn viewer-missing-btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
    )
  }

  if (status === 'missing' || !data) {
    return (
      <div className="viewer-missing">
        <h1>Altar no encontrado</h1>
        <p>El enlace no existe o ya no está disponible.</p>
        <a className="btn viewer-missing-btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
    )
  }

  return (
    <div className="app">
      {data.adminPreview && (
        <div className="admin-preview-banner">
          Vista de admin — este altar está oculto al público.{' '}
          <a href="#/admin">Volver al panel</a>
        </div>
      )}
      <Canvas shadows camera={{ position: [0, 3.2, 5.5], fov: 50 }}>
        <AltarScene
          photo={data.photo}
          clothColor={data.clothColor}
          objects={data.objects}
          selectedIds={[]}
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
          {messages.length > 0 && (
            <button className="btn" onClick={() => setShowMessageList(true)}>
              Ver mensajes ({messages.length})
            </button>
          )}
          <a className="btn" href="#/">
            Crear mi propio altar
          </a>
          <button
            className="btn viewer-report-btn"
            onClick={handleReport}
            disabled={reportState === 'sending' || reportState === 'sent'}
            title="Reportar este altar por contenido inapropiado"
          >
            {reportState === 'sent' ? 'Reportado' : 'Reportar'}
          </button>
        </div>
        {reportState === 'error' && (
          <div className="viewer-report-error">No se pudo enviar el reporte. Probá de nuevo.</div>
        )}
        <MusicPlayer />
      </div>

      {showMessageForm && (
        <MessageForm
          slug={slug}
          onClose={() => setShowMessageForm(false)}
          onSaved={(message) => setMessages((prev) => [...prev, message])}
        />
      )}

      {showMessageList && (
        <MessageList messages={messages} onClose={() => setShowMessageList(false)} />
      )}
    </div>
  )
}
