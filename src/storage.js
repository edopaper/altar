// Guardado/lectura de altares compartidos, respaldado por Supabase.
// Compartir pasa por la Edge Function `share-altar` (valida rate limit por
// IP, sube la foto y hace el insert con la service role key: el cliente ya
// no tiene permiso de insert directo). La lectura sigue siendo un select
// directo, que es público.
import { supabase } from './supabaseClient.js'

// Slug + editToken del último altar compartido desde este navegador: al
// compartir de nuevo se reenvían para actualizar esa misma fila en vez de
// crear un altar nuevo cada vez.
const EDIT_KEY = 'altar-edit-v1'

function loadEditInfo() {
  try {
    const raw = localStorage.getItem(EDIT_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.slug && parsed?.editToken ? parsed : null
  } catch {
    return null
  }
}

function saveEditInfo(slug, editToken) {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify({ slug, editToken }))
  } catch {
    // almacenamiento lleno o bloqueado: se ignora, el próximo share crea uno nuevo
  }
}

function clearEditInfo() {
  try {
    localStorage.removeItem(EDIT_KEY)
  } catch {
    // sin acceso a localStorage: nada que limpiar
  }
}

async function invokeShareAltar(body) {
  const { data, error } = await supabase.functions.invoke('share-altar', { body })

  if (error) {
    let message = 'No se pudo compartir el altar.'
    let invalidEditToken = false
    try {
      const errorBody = await error.context?.json()
      if (errorBody?.error) message = errorBody.error
      invalidEditToken = errorBody?.invalidEditToken === true
    } catch {
      // Sin body legible (ej. error de red): se usa el mensaje genérico.
    }
    const err = new Error(message)
    err.invalidEditToken = invalidEditToken
    throw err
  }

  return data
}

export async function saveSharedAltar({ objects, photo, name, clothColor }) {
  const editInfo = loadEditInfo()
  const body = { objects, photo, name, clothColor }
  if (editInfo) Object.assign(body, editInfo)

  let data
  try {
    data = await invokeShareAltar(body)
  } catch (err) {
    if (editInfo && err.invalidEditToken) {
      // El altar guardado ya no existe o el token no matchea (ej. se borró
      // desde el panel de admin): se limpia y se reintenta como uno nuevo.
      clearEditInfo()
      data = await invokeShareAltar({ objects, photo, name, clothColor })
    } else {
      throw err
    }
  }

  if (!data?.slug) throw new Error('No se pudo compartir el altar.')
  if (data.editToken) saveEditInfo(data.slug, data.editToken)
  return data
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
    .select('slug, name, objects, photo_url, cloth_color, status, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null

  return {
    slug: data.slug,
    name: data.name,
    createdAt: data.created_at,
    objects: data.objects,
    photo: data.photo_url,
    clothColor: data.cloth_color,
    status: data.status,
  }
}
