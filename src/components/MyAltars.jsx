import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { listMyAltars, deleteMyAltar } from '../storage.js'
import { isValidScene } from '../../supabase/functions/_shared/scene-validation.js'
import { readLocal } from '../localStore.js'
import UserAccount from './UserAccount.jsx'
import AltarEditor from '../AltarEditor.jsx'
import Modal from './Modal.jsx'

export default function MyAltars({ route }) {
  const [user, setUser] = useState(undefined)
  const [altars, setAltars] = useState(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    let active = true
    setAltars(null)
    setError('')
    if (user) listMyAltars().then(rows => { if (active) setAltars(rows) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [user?.id, retry])
  const slug = route.match(/^#\/mis-altares\/editar\/([a-z0-9]+)$/)?.[1]
  const isNew = /^#\/mis-altares\/nuevo(?:\/[a-z0-9-]+)?$/.test(route)
  const newKey = route.split('/')[3] || 'new'
  let resumedSlug = null
  if (user && isNew) {
    try { resumedSlug = JSON.parse(readLocal(`account:${user.id}:${newKey}:workspace-v2`))?.slug } catch {}
  }
  const selected = altars?.find(a => a.slug === (slug || resumedSlug))
  if (user && altars && ((selected && isValidScene(selected.objects)) || (isNew && altars.length < 3))) {
    return <AltarEditor key={`${user.id}:${slug || newKey}`} initialAltar={selected || { objects: [], name: 'Mi altar' }} draftPrefix={`account:${user.id}:${slug || newKey}:`} />
  }
  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteMyAltar(deleting.slug)
      // Discard only the deleted altar's local draft.
      for (const key of ['altar-objects-v1', 'altar-photo-v1', 'altar-cloth-color-v1', 'altar-name-v1', 'altar-slug-v1', 'workspace-v2', 'recovery-v2']) {
        try { localStorage.removeItem(`account:${user.id}:${deleting.slug}:${key}`) } catch {}
      }
      setAltars(rows => rows.filter(a => a.slug !== deleting.slug))
      setDeleting(null)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <main className="my-altars">
    <UserAccount />
    <a className="menu-about-link" href="#/">← Volver al editor</a>
    <p className="menu-eyebrow">Tus recuerdos, en un solo lugar</p>
    <h1>Mis altares</h1>
    <p>Puedes guardar hasta 3 altares por cuenta. Editarlos conserva su enlace.</p>
    {user === undefined ? <p role="status">Cargando cuenta…</p> : !user ? <p>Entra con Google para ver y administrar tus altares.</p> : <>
      {error && <div role="alert"><p>{error}</p><button className="btn" onClick={() => setRetry(n => n + 1)}>Reintentar</button></div>}
      {!altars && !error && <p role="status">Cargando tus altares…</p>}
      {altars && <>
        <div className="my-altars-actions"><span>{altars.length} de 3 altares</span>
          {altars.length < 3 ? <a className="btn btn--primary" href={`#/mis-altares/nuevo/${crypto.randomUUID()}`}>+ Crear altar</a> : <p>Has llegado al máximo. Puedes editar uno o eliminarlo para liberar espacio.</p>}
        </div>
        {slug && !selected && <p role="alert">Este altar no está disponible en tu cuenta.</p>}
        {selected && !isValidScene(selected.objects) && <p role="alert">El altar contiene datos incompatibles.</p>}
        {!altars.length && <div className="menu-empty">Aquí vivirán tus ofrendas. Crea tu primer altar o comparte el que ya estás preparando.</div>}
        <div className="my-altars-grid">{altars.map(altar => <article className="my-altar-card" key={altar.slug}>
          <div className="my-altar-cover">{altar.photo_url ? <img src={altar.photo_url} alt="" /> : <span aria-hidden="true">✺</span>}</div>
          <h2>{altar.name}</h2>
          <p>{new Date(altar.created_at).toLocaleDateString('es-MX')} · {!altar.is_published ? 'Borrador privado' : altar.status === 'hidden' ? 'Oculto por moderación' : 'Publicado'}</p>
          <div className="shape-row"><a className="btn btn--primary" href={`#/mis-altares/editar/${altar.slug}`}>Editar</a>{altar.is_published && <a className="btn" href={`#/ver/${altar.slug}`}>Ver altar</a>}</div>
          <button className="btn btn--danger btn--block" onClick={() => setDeleting(altar)}>Eliminar</button>
        </article>)}</div>
      </>}
    </>}
    {deleting && <Modal label="Eliminar altar" className="message-form" onClose={() => { if (!busy) setDeleting(null) }}>
      <h2>¿Eliminar «{deleting.name}»?</h2><p>El enlace dejará de funcionar y se eliminarán sus mensajes. Esta acción no se puede deshacer.</p>
      {error && <p role="alert">{error}</p>}
      <div className="shape-row"><button className="btn" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button className="btn btn--danger" disabled={busy} onClick={remove}>{busy ? 'Eliminando…' : 'Eliminar altar'}</button></div>
    </Modal>}
  </main>
}
