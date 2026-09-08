import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { POST_LOGIN_REDIRECT_KEY, rememberLoginRoute } from '../auth.js'
import { isValidScene } from '../../supabase/functions/_shared/scene-validation.js'
import { supabase } from '../supabaseClient.js'
import AltarScene from './AltarScene.jsx'
import MusicPlayer from './MusicPlayer.jsx'
import { QualityControls } from '../QualityContext.jsx'

const DEFAULT_CIET_INTERVAL = 30
const MIN_CIET_INTERVAL = 5
const IDLE_DELAY_MS = 4000
const noop = () => {}
const StableMusicPlayer = memo(MusicPlayer)

function useIdle(delayMs) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
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
  }, [delayMs])
  return idle
}

function normalizeAltar(row) {
  if (!row || !isValidScene(row.objects)) return null
  return {
    slug: row.slug,
    name: row.name || row.slug,
    objects: row.objects,
    photo: row.photo_url,
    clothColor: row.cloth_color,
  }
}

export default function CietPage() {
  const focusRef = useRef(null)
  const idle = useIdle(IDLE_DELAY_MS)
  const [session, setSession] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [altars, setAltars] = useState([])
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_CIET_INTERVAL)
  const [activeIndex, setActiveIndex] = useState(0)

  const activeAltar = altars[activeIndex] ?? null
  const intervalMs = useMemo(
    () => Math.max(MIN_CIET_INTERVAL, Number(intervalSeconds) || DEFAULT_CIET_INTERVAL) * 1000,
    [intervalSeconds],
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setIsAdmin(null)
      return
    }
    let cancelled = false
    supabase.rpc('is_admin').then(({ data, error: adminError }) => {
      if (cancelled) return
      setIsAdmin(!adminError && data === true)
    })
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    setStatus('loading')
    setError('')

    async function loadCiet() {
      const { data: config, error: configError } = await supabase
        .from('ciet_config')
        .select('selected_slugs, rotation_seconds')
        .eq('id', 'default')
        .maybeSingle()

      if (cancelled) return
      if (configError) {
        setError('No se pudo cargar la configuración de CIET.')
        setStatus('error')
        return
      }

      const selectedSlugs = Array.isArray(config?.selected_slugs) ? config.selected_slugs.filter(Boolean) : []
      setIntervalSeconds(Math.max(MIN_CIET_INTERVAL, Number(config?.rotation_seconds) || DEFAULT_CIET_INTERVAL))

      if (selectedSlugs.length === 0) {
        setAltars([])
        setStatus('empty')
        return
      }

      const { data: rows, error: altarsError } = await supabase
        .from('altars')
        .select('slug, name, objects, photo_url, cloth_color, status')
        .in('slug', selectedSlugs)

      if (cancelled) return
      if (altarsError) {
        setError('No se pudieron cargar los altares de CIET.')
        setStatus('error')
        return
      }

      const bySlug = new Map((rows ?? []).map((row) => [row.slug, normalizeAltar(row)]))
      const ordered = selectedSlugs.map((slug) => bySlug.get(slug)).filter(Boolean)
      setAltars(ordered)
      setActiveIndex(0)
      setStatus(ordered.length > 0 ? 'ready' : 'empty')
    }

    loadCiet()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  useEffect(() => {
    if (status !== 'ready' || altars.length <= 1) return undefined
    const timer = setInterval(() => {
      setActiveIndex((value) => (value + 1) % altars.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [altars.length, intervalMs, status])

  const handleLogin = async () => {
    rememberLoginRoute(POST_LOGIN_REDIRECT_KEY, '#/ciet')
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
  }

  if (session === undefined || (session && isAdmin === null) || (session && isAdmin && status === 'loading')) {
    return (
      <div className="viewer-missing">
        <h1>Cargando Altares</h1>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="viewer-missing">
        <h1>CIET</h1>
        <p>Ingresá con GitHub para abrir esta página.</p>
        <button className="btn btn--active" onClick={handleLogin}>
          Ingresar con GitHub
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="viewer-missing">
        <h1>Sin permisos</h1>
        <p>Esta página solo está disponible para admin.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="viewer-missing">
        <h1>No se pudo abrir CIET</h1>
        <p>{error}</p>
        <a className="btn viewer-missing-btn" href="#/admin">
          Volver al admin
        </a>
      </div>
    )
  }

  if (status === 'empty' || !activeAltar) {
    return (
      <div className="viewer-missing">
        <h1>CIET sin altares</h1>
        <p>Configurá la selección desde el panel de admin.</p>
        <a className="btn viewer-missing-btn" href="#/admin">
          Volver al admin
        </a>
      </div>
    )
  }

  return (
    <div className="app ciet-page">
      <div className={`ciet-ui ${idle ? 'ciet-ui--hidden' : ''}`}>
        <QualityControls floating />
      </div>
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 3.2, 5.5], fov: 50 }}>
        <AltarScene
          photo={activeAltar.photo}
          clothColor={activeAltar.clothColor}
          objects={activeAltar.objects}
          selectedIds={[]}
          mode="translate"
          snap={false}
          onSelect={noop}
          onTransform={noop}
          focusRef={focusRef}
          autoOrbit
          respectReducedMotionForAutoOrbit={false}
          messages={[]}
        />
      </Canvas>

      <div className="ciet-overlay">
        <div>
          <span className="ciet-kicker">Altares CGTI</span>
          <h1>{activeAltar.name}</h1>
        </div>
        <div className={`ciet-meta ciet-ui ${idle ? 'ciet-ui--hidden' : ''}`}>
          {activeIndex + 1} / {altars.length} · cambia cada {Math.round(intervalMs / 1000)}s
        </div>
      </div>

      <div className={`ciet-admin-bar ciet-ui ${idle ? 'ciet-ui--hidden' : ''}`}>
        <a className="btn" href="#/admin">
          Admin
        </a>
        <a className="btn" href={`#/ver/${activeAltar.slug}`} target="_blank" rel="noreferrer">
          Ver altar
        </a>
      </div>
      <div className={`ciet-music ciet-ui ${idle ? 'ciet-ui--hidden' : ''}`}>
        <StableMusicPlayer />
      </div>
    </div>
  )
}
