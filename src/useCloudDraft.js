import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { saveSharedAltar, listMyAltars } from './storage.js'
import { contentOf, fingerprint, hasContent } from './draftState.js'

export default function useCloudDraft(content, applyContent, initial, prefix) {
  const [meta, setMeta] = useState(() => ({ ...initial, draftId: initial.draftId ?? crypto.randomUUID().replaceAll('-', '') }))
  const [conflict, setConflict] = useState(initial.conflict ?? null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  // Con sesión el prefijo es `account:<id>:root:`; sin ella no hay a dónde
  // subir el altar y el guardado es solo local.
  const managed = prefix.startsWith('account:')
  const latest = useRef()
  latest.current = { content, meta, conflict }
  const lock = useRef(false)
  const alive = useRef(true)
  const dirty = fingerprint(content) !== meta.baseline
  const persist = () => {
    const value = latest.current
    try { localStorage.setItem(prefix + 'workspace-v2', JSON.stringify({ ...value.meta, content: value.content, conflict: undefined })); return true } catch { return false }
  }
  useEffect(() => {
    const timer = setTimeout(() => setLocalError(!persist()), 400)
    return () => clearTimeout(timer)
  }, [content, meta, prefix])
  useEffect(() => {
    alive.current = true
    const flush = () => persist()
    const connectivity = () => setOnline(navigator.onLine)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('online', connectivity)
    window.addEventListener('offline', connectivity)
    return () => {
      alive.current = false
      persist()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('online', connectivity)
      window.removeEventListener('offline', connectivity)
    }
  }, [prefix])
  const refresh = async () => {
    const current = latest.current
    if (!current.meta.slug || lock.current || !navigator.onLine) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !prefix.startsWith(`account:${session.user.id}:`)) return
      const remote = (await listMyAltars()).find(a => a.slug === current.meta.slug)
      if (!alive.current || latest.current.meta.slug !== current.meta.slug || latest.current.meta.revision !== current.meta.revision || lock.current) return
      if (!remote) { setError('Este altar ya no está disponible en tu cuenta. Tu copia local se conserva.'); return }
      setError('')
      if (remote.revision !== latest.current.meta.revision) {
        if (fingerprint(latest.current.content) !== latest.current.meta.baseline) setConflict(remote)
        else {
          const next = contentOf(remote)
          applyContent(next)
          setMeta({ ...remote, baseline: fingerprint(next) })
        }
      }
    } catch (err) { if (alive.current) setError(err.message) }
  }
  useEffect(() => {
    refresh()
    const wake = () => refresh()
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    return () => { window.removeEventListener('focus', wake); window.removeEventListener('online', wake) }
  }, [])
  const save = async (publish = false) => {
    if (lock.current || latest.current.conflict) return null
    lock.current = true
    setBusy(true)
    setError('')
    const snapshot = latest.current
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !prefix.startsWith(`account:${session.user.id}:`)) throw new Error('Entra con Google para guardar y publicar tu altar.')
      const result = await saveSharedAltar({ ...snapshot.content, slug: snapshot.meta.slug, managed: true, draftId: snapshot.meta.draftId, revision: snapshot.meta.revision ?? 0, action: publish ? 'publish' : 'save', expectedUserId: session.user.id, editToken: snapshot.meta.editToken })
      if (!alive.current) return null
      setMeta({ ...result, baseline: fingerprint(snapshot.content) })
      return result
    } catch (err) {
      if (!alive.current) return null
      setError(err.message)
      if (err.conflict) {
        try {
          const remote = (await listMyAltars()).find(a => a.slug === (snapshot.meta.slug || snapshot.meta.draftId))
          if (alive.current && remote) setConflict(remote)
        } catch { /* The error remains visible; retry is explicit. */ }
      }
      return null
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
    }
  }
  // El borrador se guarda solo: con sesión, el primer cambio crea el altar
  // en la cuenta (antes hacía falta apretar "Guardar borrador", que convivía
  // confusamente con "Publicar") y los siguientes se sincronizan tras unos
  // segundos de calma. Un error corta el ciclo a propósito: si la cuenta ya
  // llegó al límite de altares no tiene sentido reintentar solo, el mensaje
  // queda a la vista con su "Reintentar".
  const CREATE_DELAY_MS = 2500
  const SYNC_DELAY_MS = 10000
  useEffect(() => {
    if (!managed || !dirty || conflict || busy || error || !online) return
    // El altar se crea recién cuando hay algo adentro; ya creado, se
    // sincroniza siempre (incluso si quedó vacío tras borrar todo).
    if (!meta.slug && !hasContent(content)) return
    const timer = setTimeout(() => save(false), meta.slug ? SYNC_DELAY_MS : CREATE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [content, meta.slug, dirty, conflict, busy, error, online, managed])
  const resolve = (useLocal) => {
    if (!conflict) return
    const remote = contentOf(conflict)
    // Keep the alternative recoverable whichever version the user chooses.
    try { localStorage.setItem(prefix + 'recovery-v2', JSON.stringify(useLocal ? remote : content)) } catch { setLocalError(true); return }
    if (!useLocal) applyContent(remote)
    setMeta({ ...conflict, baseline: fingerprint(remote) })
    setConflict(null)
    setError('')
  }
  return { ...meta, busy, dirty, conflict, error, online, localError, managed, save, resolve,
    retryLocal: () => setLocalError(!persist()),
    restoreRecovery: () => {
      try { const value = JSON.parse(localStorage.getItem(prefix + 'recovery-v2')); if (value) applyContent(value) } catch { setLocalError(true) }
    } }
}
