import { isValidScene } from '../supabase/functions/_shared/scene-validation.js'
import { cleanTribute } from '../supabase/functions/_shared/tribute.js'
// Guardado/lectura de altares compartidos, respaldado por Supabase.
// Compartir exige sesión y pasa por share-altar. La base de datos limita
// cada cuenta a tres altares; los enlaces públicos siguen siendo legibles.
import { supabase } from './supabaseClient.js'

// Slug + editToken del último altar compartido desde este navegador: al
// compartir de nuevo se reenvían para actualizar esa misma fila en vez de
// crear un altar nuevo cada vez.
const EDIT_KEY = 'altar-edit-v1'

function loadEditInfo(userId) {
  try {
    const raw = localStorage.getItem(EDIT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.slug && parsed?.editToken && (!parsed.userId || parsed.userId === userId) ? parsed : null
  } catch {
    return null
  }
}

function saveEditInfo(slug, editToken, userId) {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify({ slug, editToken, userId }))
  } catch {
    // almacenamiento lleno o bloqueado: se ignora, el próximo share crea uno nuevo
  }
}

async function invokeShareAltar(body) {
  const { data, error } = await supabase.functions.invoke('share-altar', { body })

  if (error) {
    let message = 'No se pudo guardar el altar.'
    let conflict = false
    try {
      const errorBody = await error.context?.json()
      if (errorBody?.error) message = errorBody.error
      conflict = Boolean(errorBody?.conflict)
    } catch {
      // Sin body legible (ej. error de red): se usa el mensaje genérico.
    }
    throw Object.assign(new Error(message), { conflict })
  }

  return data
}

export async function saveSharedAltar({ objects, photo, name, clothColor, tribute, slug, managed = false, revision = 0, action = 'publish', expectedUserId, editToken, draftId }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión para guardar tus altares.')
  if (expectedUserId && session.user.id !== expectedUserId) throw new Error('La cuenta cambió. Vuelve a abrir tu altar.')
  // A previous deployment ignores `action` and publishes every save. Probe
  // without scene data first: old servers reject this without writing anything.
  try {
    const capabilities = await invokeShareAltar({ action: 'capabilities' })
    if (capabilities?.draftProtocol !== 2) throw new Error('Unsupported protocol')
  } catch {
    throw new Error('No se pudo verificar el guardado privado. Revisa tu conexión o actualiza el servidor. Tu copia local se conserva.')
  }
  const editInfo = managed ? null : loadEditInfo(session.user.id)
  const body = { objects, photo, name, clothColor, tribute, revision, action, ...(!slug && draftId ? { draftId } : {}) }
  if (slug) { body.slug = slug; if (editToken) body.editToken = editToken }
  else if (editInfo) Object.assign(body, editInfo)
  const data = await invokeShareAltar(body)
  if (!data?.slug) throw new Error('No se pudo compartir el altar.')
  if (!managed && data.editToken) saveEditInfo(data.slug, data.editToken, session.user.id)
  return data
}

export async function listMyAltars() {
  const { data, error } = await supabase.rpc('my_altars')
  if (error) throw new Error('No se pudieron cargar tus altares. Revisa tu conexión y la configuración del servidor.')
  return data ?? []
}

export async function deleteMyAltar(slug) {
  const { data, error } = await supabase.rpc('delete_my_altar', { p_slug: slug })
  if (error || !data) throw new Error('No se pudo eliminar el altar.')
}

export async function reportAltar(slug) {
  const { data, error } = await supabase.functions.invoke('report-altar', {
    body: { slug },
  })

  if (error) {
    let message = 'No se pudo reportar el altar.'
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {
      // Sin body legible (ej. error de red): se usa el mensaje genérico.
    }
    throw new Error(message)
  }

  return data
}

export async function loadSharedAltar(slug) {
  const { data, error } = await supabase
    .from('altars')
    .select('slug, name, objects, photo_url, cloth_color, tribute, status, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error('No se pudo cargar el altar. Revisa tu conexión e intenta de nuevo.')
  if (!data) return null
  if (!isValidScene(data.objects)) throw new Error('El altar contiene datos incompatibles o dañados.')

  return {
    slug: data.slug,
    name: data.name,
    createdAt: data.created_at,
    objects: data.objects,
    photo: data.photo_url,
    clothColor: data.cloth_color,
    tribute: cleanTribute(data.tribute),
    status: data.status,
  }
}
