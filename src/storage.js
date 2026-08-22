// Guardado/lectura de altares compartidos, respaldado por Supabase
// (tabla `altars` + bucket `altar-photos`). Mismo contrato que antes: un
// objeto con objects + photo bajo un slug corto, ahora async porque implica
// red.
import { supabase } from './supabaseClient.js'

const SLUG_ATTEMPTS = 5

function randomSlug() {
  return Math.random().toString(36).slice(2, 7)
}

// Sube la foto (data URL) al bucket público y devuelve su URL pública.
async function uploadPhoto(slug, photoDataUrl) {
  const res = await fetch(photoDataUrl)
  const blob = await res.blob()
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const path = `${slug}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('altar-photos')
    .upload(path, blob, { contentType: blob.type, upsert: false })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('altar-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function saveSharedAltar({ objects, photo, name, clothColor }) {
  // Se sube una sola vez, con el primer slug generado; si hay que
  // reintentar por colisión de slug, se reutiliza la URL ya subida.
  let photoUrl = null

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = randomSlug()

    if (photo && photoUrl === null) {
      photoUrl = await uploadPhoto(slug, photo)
    }

    const { error } = await supabase.from('altars').insert({
      slug,
      name: name ?? 'Altar de muertos',
      objects,
      photo_url: photoUrl,
      cloth_color: clothColor ?? null,
    })

    if (!error) return slug

    // Colisión de slug (PK duplicada): reintentar con otro. Cualquier otro
    // error se propaga.
    if (error.code !== '23505') throw error
  }

  throw new Error('No se pudo generar un slug único para el altar.')
}

export async function loadSharedAltar(slug) {
  const { data, error } = await supabase
    .from('altars')
    .select('*')
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
  }
}
