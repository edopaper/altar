import { useEffect, useState } from 'react'
import { getUserAvatar, getUserDisplayName, USER_LOGIN_REDIRECT_KEY } from '../auth.js'
import { supabase } from '../supabaseClient.js'

export default function UserAccount({ compact = false }) {
  const [session, setSession] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setBusy(false)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const login = async () => {
    setBusy(true)
    setError('')
    sessionStorage.setItem(USER_LOGIN_REDIRECT_KEY, window.location.hash || '#/')
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (loginError) {
      setBusy(false)
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  const logout = async () => {
    setBusy(true)
    setError('')
    const { error: logoutError } = await supabase.auth.signOut()
    setBusy(false)
    if (logoutError) setError('No se pudo cerrar sesión.')
  }

  if (session === undefined) {
    return <div className={`account-panel ${compact ? 'account-panel--compact' : ''}`}>Cargando cuenta…</div>
  }

  if (!session) {
    return (
      <div className={`account-panel ${compact ? 'account-panel--compact' : ''}`}>
        <button className="account-google-btn" onClick={login} disabled={busy}>
          <span className="account-google-mark" aria-hidden="true">G</span>
          {busy ? 'Abriendo…' : 'Entrar con Google'}
        </button>
        {error && <div className="account-error">{error}</div>}
      </div>
    )
  }

  const name = getUserDisplayName(session.user)
  const avatar = getUserAvatar(session.user)

  return (
    <div className={`account-panel account-panel--signed-in ${compact ? 'account-panel--compact' : ''}`}>
      {avatar ? (
        <img className="account-avatar" src={avatar} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="account-avatar account-avatar--fallback" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="account-name" title={name}>{name}</span>
      <button className="account-signout" onClick={logout} disabled={busy}>
        Salir
      </button>
      {error && <div className="account-error">{error}</div>}
    </div>
  )
}
