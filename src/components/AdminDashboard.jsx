import { useEffect, useMemo, useState } from 'react'
import { POST_LOGIN_REDIRECT_KEY, rememberLoginRoute } from '../auth.js'
import { supabase } from '../supabaseClient.js'

const ALTARS_PAGE_SIZE = 20
const ALL_ALTARS_PAGE_SIZE = 50
const MESSAGES_PAGE_SIZE = 20
const DEFAULT_CIET_INTERVAL = 30
const MIN_CIET_INTERVAL = 5

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
  const [allAltars, setAllAltars] = useState([])
  const [allAltarsHasMore, setAllAltarsHasMore] = useState(false)
  const [allAltarsLoadingMore, setAllAltarsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busySlug, setBusySlug] = useState(null)
  const [expandedSlug, setExpandedSlug] = useState(null)
  const [messagesBySlug, setMessagesBySlug] = useState({}) // slug -> { items, hasMore }
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false)
  const [busyMessageId, setBusyMessageId] = useState(null)
  const [cietSelectedSlugs, setCietSelectedSlugs] = useState([])
  const [cietCount, setCietCount] = useState(0)
  const [cietInterval, setCietInterval] = useState(DEFAULT_CIET_INTERVAL)
  const [cietSaving, setCietSaving] = useState(false)
  const [cietMessage, setCietMessage] = useState('')
  const [cietError, setCietError] = useState('')

  const cietSelectedSet = useMemo(() => new Set(cietSelectedSlugs), [cietSelectedSlugs])

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

  const loadAllAltars = (reset = true) => {
    const from = reset ? 0 : allAltars.length
    const to = from + ALL_ALTARS_PAGE_SIZE - 1
    if (!reset) setAllAltarsLoadingMore(true)

    supabase
      .from('altars')
      .select('slug, name, status, reported_count, created_at')
      .order('created_at', { ascending: false })
      .range(from, to)
      .then(({ data, error }) => {
        if (!reset) setAllAltarsLoadingMore(false)
        if (error) {
          setLoadError('No se pudo cargar la lista completa de altares.')
          return
        }
        const rows = data ?? []
        setAllAltars((prev) => (reset ? rows : [...prev, ...rows]))
        setAllAltarsHasMore(rows.length === ALL_ALTARS_PAGE_SIZE)
      })
  }

  const loadCietConfig = () => {
    setCietError('')
    supabase
      .from('ciet_config')
      .select('selected_slugs, rotation_seconds')
      .eq('id', 'default')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setCietError('No se pudo cargar CIET. Revisa que la migración 018 esté aplicada.')
          return
        }
        const selected = Array.isArray(data?.selected_slugs) ? data.selected_slugs.filter(Boolean) : []
        const interval = Number(data?.rotation_seconds) || DEFAULT_CIET_INTERVAL
        setCietSelectedSlugs(selected)
        setCietCount(selected.length)
        setCietInterval(Math.max(MIN_CIET_INTERVAL, interval))
      })
  }

  useEffect(() => {
    if (isAdmin) {
      loadAltars()
      loadAllAltars()
      loadCietConfig()
    }
  }, [isAdmin])

  const handleLogin = async () => {
    rememberLoginRoute(POST_LOGIN_REDIRECT_KEY, '#/admin')
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
    setAllAltars((prev) => prev.map((a) => (a.slug === slug ? { ...a, status } : a)))
  }

  const handleCietCountChange = (event) => {
    const next = Math.max(0, Number(event.target.value) || 0)
    setCietCount(next)
    setCietSelectedSlugs((prev) => prev.slice(0, next))
  }

  const toggleCietAltar = (slug) => {
    setCietMessage('')
    setCietError('')
    setCietSelectedSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((item) => item !== slug)
      if (cietCount <= 0) return prev
      if (cietCount > 0 && prev.length >= cietCount) return prev
      return [...prev, slug]
    })
  }

  const saveCietConfig = async () => {
    setCietSaving(true)
    setCietMessage('')
    setCietError('')
    const selected = cietSelectedSlugs.slice(0, cietCount || cietSelectedSlugs.length)
    const rotationSeconds = Math.max(MIN_CIET_INTERVAL, Number(cietInterval) || DEFAULT_CIET_INTERVAL)
    const { error } = await supabase
      .from('ciet_config')
      .upsert({ id: 'default', selected_slugs: selected, rotation_seconds: rotationSeconds })
    setCietSaving(false)
    if (error) {
      setCietError('No se pudo guardar la configuración de CIET.')
      return
    }
    setCietSelectedSlugs(selected)
    setCietCount(selected.length)
    setCietInterval(rotationSeconds)
    setCietMessage('Configuración de CIET guardada.')
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
          <a className="btn" href="#/ciet" target="_blank" rel="noreferrer">
            Abrir CIET
          </a>
          <button className="btn" onClick={handleLogout}>
            Salir
          </button>
        </div>
      </div>

      {loadError && <div className="admin-error">{loadError}</div>}

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>CIET</h2>
            <p>Elegí cuántos altares se rotan y cada cuánto cambia la pantalla.</p>
          </div>
          <button className="btn btn--active" disabled={cietSaving} onClick={saveCietConfig}>
            {cietSaving ? 'Guardando…' : 'Guardar CIET'}
          </button>
        </div>
        <div className="admin-ciet-controls">
          <label className="admin-field">
            <span>Cantidad de altares</span>
            <input min="0" type="number" value={cietCount} onChange={handleCietCountChange} />
          </label>
          <label className="admin-field">
            <span>Tiempo por altar (segundos)</span>
            <input
              min={MIN_CIET_INTERVAL}
              type="number"
              value={cietInterval}
              onChange={(event) => setCietInterval(event.target.value)}
            />
          </label>
          <span className="admin-card-meta">
            Seleccionados: {cietSelectedSlugs.length}{cietCount ? ` / ${cietCount}` : ''}
          </span>
        </div>
        {cietError && <div className="admin-error">{cietError}</div>}
        {cietMessage && <div className="admin-success">{cietMessage}</div>}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Altares</h2>
            <p>Lista de altares con nombre y liga pública. Marcá cuáles entran a CIET.</p>
          </div>
          <button className="btn" onClick={() => loadAllAltars(true)}>
            Refrescar altares
          </button>
        </div>
        <div className="admin-list">
          {allAltars.map((altar) => {
            const shareHash = `#/ver/${altar.slug}`
            const shareUrl = `${window.location.origin}${window.location.pathname}${shareHash}`
            const checked = cietSelectedSet.has(altar.slug)
            const selectionFull = cietCount <= 0 || (cietSelectedSlugs.length >= cietCount && !checked)

            return (
              <div key={altar.slug} className="admin-card">
                <div className="admin-card-row">
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectionFull}
                      onChange={() => toggleCietAltar(altar.slug)}
                    />
                    <span className="admin-card-name">{altar.name || altar.slug}</span>
                  </label>
                  <div className="admin-card-main">
                    <span
                      className={`admin-badge ${altar.status === 'hidden' ? 'admin-badge--hidden' : 'admin-badge--visible'}`}
                    >
                      {altar.status === 'hidden' ? 'Oculto' : 'Visible'}
                    </span>
                    <span className="admin-card-meta">{formatDate(altar.created_at)}</span>
                  </div>
                  <div className="admin-card-actions">
                    <a className="admin-link" href={shareHash} target="_blank" rel="noreferrer">
                      {shareUrl}
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {allAltarsHasMore && (
          <button
            className="btn admin-load-more"
            disabled={allAltarsLoadingMore}
            onClick={() => loadAllAltars(false)}
          >
            {allAltarsLoadingMore ? 'Cargando…' : 'Cargar más altares'}
          </button>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Moderación</h2>
            <p>Altares reportados u ocultos.</p>
          </div>
        </div>

        {altars.length === 0 && !loadError && (
          <p className="admin-empty">No hay altares reportados u ocultos.</p>
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
      </section>
    </div>
  )
}
