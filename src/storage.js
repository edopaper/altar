// Guardado/lectura de altares compartidos, respaldado por Supabase.
// Compartir pasa por la Edge Function `share-altar` (valida rate limit por
// IP, sube la foto y hace el insert con la service role key: el cliente ya
// no tiene permiso de insert directo). La lectura sigue siendo un select
// directo, que es público.
import { supabase } from './supabaseClient.js'

export async function saveSharedAltar({ objects, photo, name, clothColor }) {
  const { data, error } = await supabase.functions.invoke('share-altar', {
    body: { objects, photo, name, clothColor },
  })

  if (error) {
    let message = 'No se pudo compartir el altar.'
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {
      // Sin body legible (ej. error de red): se usa el mensaje genérico.
    }
    throw new Error(message)
  }

  if (!data?.slug) throw new Error('No se pudo compartir el altar.')
  return data
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
