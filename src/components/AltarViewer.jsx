import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './AltarScene.jsx'
import MusicPlayer from './MusicPlayer.jsx'
import { loadSharedAltar, reportAltar } from '../storage.js'
import useMessagePages from '../useMessagePages.js'
import { QualityControls } from '../QualityContext.jsx'
import { supabase } from '../supabaseClient.js'
import { readLocal, writeLocal } from '../localStore.js'
import MessageForm from './MessageForm.jsx'
import MessageList from './MessageList.jsx'
import TributePanel from './TributePanel.jsx'
import UserAccount from './UserAccount.jsx'

const noop = () => {}
const IDLE_DELAY_MS = 6000
const HINT_KEY = 'altar-viewer-drag-hint-v1'
const HINT_DURATION_MS = 5000

// Idle a nivel de página: sin actividad unos segundos, la UI se desvanece
// (igual que arranca la órbita automática); reaparece al interactuar.
// `active` mantiene el cronómetro en pausa (nunca oculta) mientras el altar
// todavía está cargando: si no, la cuenta regresiva arrancaba desde el
// montaje y la interfaz podía empezar a desvanecerse casi al instante en
// que por fin aparecía, sin darle tiempo a nadie de leerla.
function useIdle(delayMs, active) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!active) {
      setIdle(false)
      return
    }
    let timer = setTimeout(() => setIdle(true), delayMs)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), delayMs)
    }
    window.addEventListener('keydown', wake)
    window.addEventListener('focusin', wake)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('pointermove', wake)
    window.addEventListener('wheel', wake, { passive: true })
    window.addEventListener('touchstart', wake, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('focusin', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('wheel', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [delayMs, active])
  return idle
}

// La escena es arrastrable pero nada lo indica: una pista breve, una sola
// vez por navegador, que desaparece apenas alguien interactúa o a los pocos
// segundos si nadie lo hace.
function useDragHint(active) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!active || readLocal(HINT_KEY)) return
    setShow(true)
    const dismiss = () => {
      setShow(false)
      writeLocal(HINT_KEY, '1')
    }
    const timer = setTimeout(dismiss, HINT_DURATION_MS)
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('wheel', dismiss, { passive: true })
    window.addEventListener('touchstart', dismiss, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('touchstart', dismiss)
    }
  }, [active])
  return show
}

/**
 * Visor público de un altar compartido (solo lectura): misma escena que el
 * editor pero sin selección, sin gizmos y sin panel de edición. Sin
 * actividad, la cámara orbita sola y la interfaz se oculta.
 */
export default function AltarViewer({ slug }) {
  const focusRef = useRef(null)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'missing' | 'error'
  const idle = useIdle(IDLE_DELAY_MS, status === 'ready')
  const showDragHint = useDragHint(status === 'ready')
  const messagePage = useMessagePages(slug, status === 'ready')
  const { messages } = messagePage
  const [retry, setRetry] = useState(0)
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [showMessageList, setShowMessageList] = useState(false)
  const [showTribute, setShowTribute] = useState(false)
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
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [slug, retry])

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
        <p>No pudimos recuperar el contenido. Revisa tu conexión e intenta de nuevo.</p>
        <button className="btn" onClick={() => setRetry((value) => value + 1)}>Reintentar</button>
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
      <QualityControls floating />
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 3.2, 5.5], fov: 50 }}>
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
          uiIdle={idle}
          messages={messages}
        />
      </Canvas>

      <div className={`viewer-drag-hint ${showDragHint ? '' : 'viewer-drag-hint--hidden'}`} aria-hidden="true">
        <span>↔</span> Arrastra para mirar alrededor
      </div>

      <div className={`viewer-ui ${idle ? 'viewer-ui--hidden' : ''}`}>
        <UserAccount compact />
        <div className="viewer-bar">
          <div className="viewer-bar-head">
            <span className="viewer-title">{data.name}</span>
            {data.tribute && (
              <button className="btn viewer-tribute-btn" onClick={() => setShowTribute(true)}>
                <span aria-hidden="true">✺</span>
                {data.tribute.personName ? `Sobre ${data.tribute.personName}` : 'Su historia'}
              </button>
            )}
          </div>
          <div className="viewer-bar-actions">
            <button className="btn btn--primary" onClick={() => setShowMessageForm(true)}>
              Dejar un mensaje
            </button>
            <button className="btn" onClick={() => setShowMessageList(true)}>
              Mensajes ({messages.length}{messagePage.hasMore ? '+' : ''})
            </button>
          </div>
          <div className="viewer-bar-foot">
            <a className="viewer-link-btn" href="#/">
              Crear mi propio altar
            </a>
            <button
              className="viewer-link-btn viewer-report-btn"
              onClick={handleReport}
              disabled={reportState === 'sending' || reportState === 'sent'}
              title="Reportar este altar por contenido inapropiado"
            >
              {reportState === 'sent' ? 'Reportado' : 'Reportar'}
            </button>
          </div>
        </div>
        {reportState === 'error' && (
          <div className="viewer-report-error">No se pudo enviar el reporte. Probá de nuevo.</div>
        )}
        <MusicPlayer />
      </div>

      {showTribute && data.tribute && (
        <TributePanel
          tribute={data.tribute}
          photo={data.photo}
          altarName={data.name}
          onClose={() => setShowTribute(false)}
        />
      )}

      {showMessageForm && (
        <MessageForm
          slug={slug}
          onClose={() => setShowMessageForm(false)}
          onSaved={messagePage.add}
        />
      )}

      {showMessageList && (
        <MessageList messages={messages} loading={messagePage.loading} loadError={messagePage.error} hasMore={messagePage.hasMore} onLoadMore={messagePage.loadMore} onRefresh={messagePage.refresh} onClose={() => setShowMessageList(false)} />
      )}
    </div>
  )
}
