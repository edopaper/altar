import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const POST_LOGIN_REDIRECT_KEY = 'altar-admin-redirect'
const ALTARS_PAGE_SIZE = 20
const MESSAGES_PAGE_SIZE = 20

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * Panel de moderación: solo accesible logueado con GitHub y solo si tu
 * usuario está en `admin_github_users` (chequeado server-side vía RLS/
 * is_admin(), nunca confiado en el cliente). Lista altares reportados/
 * ocultos, permite ocultar/restaurar, ver el altar (incluso oculto) y
 * revisar/moderar los mensajes que dejaron los visitantes. Ambas listas
 * (altares y mensajes por altar) paginan con "Cargar más" en vez de traer
 * todo de una — pensado para cuando la cola de moderación crezca.
 */
export default function AdminDashboard() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [isAdmin, setIsAdmin] = useState(null) // null = sin chequear todavía
  const [altars, setAltars] = useState([])
  const [altarsHasMore, setAltarsHasMore] = useState(false)
  const [altarsLoadingMore, setAltarsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busySlug, setBusySlug] = useState(null)
  const [expandedSlug, setExpandedSlug] = useState(null)
  const [messagesBySlug, setMessagesBySlug] = useState({}) // slug -> { items, hasMore }
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false)
  const [busyMessageId, setBusyMessageId] = useState(null)

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
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return
      setIsAdmin(!error && data === true)
    })
    return () => {
      cancelled = true
    }
  }, [session])

  const loadAltars = (reset = true) => {
    setLoadError('')
    const from = reset ? 0 : altars.length
    const to = from + ALTARS_PAGE_SIZE - 1
    if (!reset) setAltarsLoadingMore(true)

    supabase
      .from('altars')
      .select('slug, name, status, reported_count, created_at, messages(count)')
      .or('reported_count.gt.0,status.eq.hidden')
      .order('reported_count', { ascending: false })
      .order('created_at', { ascending: true })
      .range(from, to)
      .then(({ data, error }) => {
        if (!reset) setAltarsLoadingMore(false)
        if (error) {
          setLoadError('No se pudo cargar la lista de altares.')
          return
        }
        const rows = data ?? []
        setAltars((prev) => (reset ? rows : [...prev, ...rows]))
        setAltarsHasMore(rows.length === ALTARS_PAGE_SIZE)
      })
  }

  useEffect(() => {
    if (isAdmin) loadAltars()
  }, [isAdmin])

  const handleLogin = async () => {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, '#/admin')
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const setAltarStatus = async (slug, status) => {
    setBusySlug(slug)
    const { error } = await supabase.from('altars').update({ status }).eq('slug', slug)
    setBusySlug(null)
    if (error) {
      setLoadError('No se pudo actualizar el altar.')
      return
    }
    setAltars((prev) => prev.map((a) => (a.slug === slug ? { ...a, status } : a)))
  }

  const loadMessages = (slug, reset = true) => {
    const current = messagesBySlug[slug]
    const from = reset ? 0 : (current?.items.length ?? 0)
    const to = from + MESSAGES_PAGE_SIZE - 1
    if (reset) setMessagesLoading(true)
    else setMessagesLoadingMore(true)

    supabase
      .from('messages')
      .select('id, text, author, status, reported_count, created_at')
      .eq('slug', slug)
      .order('reported_count', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)
      .then(({ data, error }) => {
        setMessagesLoading(false)
        setMessagesLoadingMore(false)
        if (error) return
        const rows = data ?? []
        setMessagesBySlug((prev) => ({
          ...prev,
          [slug]: {
            items: reset ? rows : [...(prev[slug]?.items ?? []), ...rows],
            hasMore: rows.length === MESSAGES_PAGE_SIZE,
          },
        }))
      })
  }

  const toggleExpand = (slug) => {
    const next = expandedSlug === slug ? null : slug
    setExpandedSlug(next)
    if (next && !messagesBySlug[next]) loadMessages(next)
  }

  const setMessageStatus = async (slug, id, status) => {
    setBusyMessageId(id)
    const { error } = await supabase.from('messages').update({ status }).eq('id', id)
    setBusyMessageId(null)
    if (error) return
    setMessagesBySlug((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], items: prev[slug].items.map((m) => (m.id === id ? { ...m, status } : m)) },
    }))
  }

  const deleteMessage = async (slug, id) => {
    if (!window.confirm('¿Borrar este mensaje definitivamente?')) return
    setBusyMessageId(id)
    const { error } = await supabase.from('messages').delete().eq('id', id)
    setBusyMessageId(null)
    if (error) return
    setMessagesBySlug((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], items: prev[slug].items.filter((m) => m.id !== id) },
    }))
    setAltars((prev) =>
      prev.map((a) =>
        a.slug === slug
          ? { ...a, messages: [{ count: Math.max(0, (a.messages?.[0]?.count ?? 1) - 1) }] }
          : a,
      ),
    )
  }

  if (session === undefined) {
    return (
      <div className="admin-page">
        <p>Cargando…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="admin-page">
        <h1>Panel de moderación</h1>
        <p>Ingresá con GitHub para revisar altares reportados.</p>
        <button className="btn btn--active" onClick={handleLogin}>
          Ingresar con GitHub
        </button>
      </div>
    )
  }

  if (isAdmin === null) {
    return (
      <div className="admin-page">
        <p>Verificando permisos…</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <h1>Sin permisos</h1>
        <p>Tu cuenta de GitHub no tiene acceso al panel de moderación.</p>
        <button className="btn" onClick={handleLogout}>
          Salir
        </button>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>Panel de moderación</h1>
        <div className="admin-header-actions">
          <button className="btn" onClick={() => loadAltars(true)}>
            Refrescar
          </button>
          <button className="btn" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </div>

      {loadError && <div className="admin-error">{loadError}</div>}

      {altars.length === 0 && !loadError && (
        <p className="admin-empty">No hay altares reportados u ocultos. Todo tranquilo 🕯️</p>
      )}

      <div className="admin-list">
        {altars.map((altar) => {
          const messageCount = altar.messages?.[0]?.count ?? 0
          const expanded = expandedSlug === altar.slug
          const messageState = messagesBySlug[altar.slug]

          return (
            <div key={altar.slug} className="admin-card">
              <div className="admin-card-row">
                <div className="admin-card-main">
                  <span
                    className={`admin-badge ${altar.status === 'hidden' ? 'admin-badge--hidden' : 'admin-badge--visible'}`}
                  >
                    {altar.status === 'hidden' ? 'Oculto' : 'Visible'}
                  </span>
                  <span className="admin-card-name">{altar.name || altar.slug}</span>
                  <span className="admin-card-meta">
                    {altar.reported_count} reporte{altar.reported_count === 1 ? '' : 's'} ·{' '}
                    {formatDate(altar.created_at)}
                  </span>
                </div>
                <div className="admin-card-actions">
                  <a className="btn" href={`#/ver/${altar.slug}`} target="_blank" rel="noreferrer">
                    Ver altar
                  </a>
                  <button
                    className="btn"
                    disabled={busySlug === altar.slug}
                    onClick={() => toggleExpand(altar.slug)}
                  >
                    Mensajes ({messageCount}) {expanded ? '▴' : '▾'}
                  </button>
                  {altar.status === 'hidden' ? (
                    <button
                      className="btn"
                      disabled={busySlug === altar.slug}
                      onClick={() => setAltarStatus(altar.slug, 'visible')}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <button
                      className="btn btn--danger"
                      disabled={busySlug === altar.slug}
                      onClick={() => setAltarStatus(altar.slug, 'hidden')}
                    >
                      Ocultar
                    </button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="admin-messages">
                  {messagesLoading && !messageState && (
                    <p className="admin-empty">Cargando mensajes…</p>
                  )}
                  {messageState && messageState.items.length === 0 && (
                    <p className="admin-empty">Este altar no tiene mensajes.</p>
                  )}
                  {messageState?.items.map((m) => (
                    <div key={m.id} className="admin-message">
                      <div className="admin-message-body">
                        <span
                          className={`admin-badge admin-badge--small ${m.status === 'hidden' ? 'admin-badge--hidden' : 'admin-badge--visible'}`}
                        >
                          {m.status === 'hidden' ? 'Oculto' : 'Visible'}
                        </span>
                        <span className="admin-message-text">"{m.text}"</span>
                        <span className="admin-card-meta">
                          — {m.author || 'Anónimo'} · {formatDate(m.created_at)}
                          {m.reported_count > 0 &&
                            ` · ${m.reported_count} reporte${m.reported_count === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <div className="admin-message-actions">
                        {m.status === 'hidden' ? (
                          <button
                            className="btn"
                            disabled={busyMessageId === m.id}
                            onClick={() => setMessageStatus(altar.slug, m.id, 'visible')}
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            className="btn"
                            disabled={busyMessageId === m.id}
                            onClick={() => setMessageStatus(altar.slug, m.id, 'hidden')}
                          >
                            Ocultar
                          </button>
                        )}
                        <button
                          className="btn btn--danger"
                          disabled={busyMessageId === m.id}
                          onClick={() => deleteMessage(altar.slug, m.id)}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                  {messageState?.hasMore && (
                    <button
                      className="btn admin-load-more"
                      disabled={messagesLoadingMore}
                      onClick={() => loadMessages(altar.slug, false)}
                    >
                      {messagesLoadingMore ? 'Cargando…' : 'Cargar más mensajes'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {altarsHasMore && (
        <button
          className="btn admin-load-more"
          disabled={altarsLoadingMore}
          onClick={() => loadAltars(false)}
        >
          {altarsLoadingMore ? 'Cargando…' : 'Cargar más altares'}
        </button>
      )}
    </div>
  )
}

export { POST_LOGIN_REDIRECT_KEY }
