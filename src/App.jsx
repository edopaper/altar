import { lazy, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { POST_LOGIN_REDIRECT_KEY, USER_LOGIN_REDIRECT_KEY } from './auth.js'
const AltarEditor = lazy(() => import('./AltarEditor.jsx'))
const AltarViewer = lazy(() => import('./components/AltarViewer.jsx'))
const ThumbnailStage = lazy(() => import('./components/ThumbnailStage.jsx'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'))

// Rutas por hash, sin dependencias: "#/" editor, "#/ver/<slug>" visor.
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()

  // Tras volver del login con GitHub (sin hash propio en el redirectTo, para
  // no chocar con supabase-js al parsear el token de la URL), si el usuario
  // había arrancado el login desde el panel de admin lo mandamos de vuelta.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN') return
      const redirect = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
      const userRedirect = sessionStorage.getItem(USER_LOGIN_REDIRECT_KEY)
      if (redirect) {
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
        window.location.hash = redirect
      } else if (userRedirect) {
        sessionStorage.removeItem(USER_LOGIN_REDIRECT_KEY)
        window.location.hash = userRedirect
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Ruta oculta usada solo por scripts/generate-thumbnails.mjs, para
  // renderizar un modelo a la vez sobre fondo transparente.
  const thumbMatch = hash.match(/^#\/thumb\/(.+)$/)
  if (thumbMatch) return <ThumbnailStage path={decodeURIComponent(thumbMatch[1])} />
  const viewMatch = hash.match(/^#\/ver\/([a-z0-9]+)/i)
  if (viewMatch) return <AltarViewer key={viewMatch[1]} slug={viewMatch[1]} />
  if (hash.startsWith('#/admin')) return <AdminDashboard />
  return <AltarEditor />
}
