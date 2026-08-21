// Guardado/lectura de altares compartidos. Hoy el "backend" es localStorage;
// cuando entre Supabase, estas dos funciones son el único punto a reemplazar
// (mismo contrato: un JSON con objects + photo bajo un slug corto).
const SHARED_PREFIX = 'altar-shared-v1:'

export function saveSharedAltar({ objects, photo, name, clothColor }) {
  const slug = Math.random().toString(36).slice(2, 7)
  const payload = {
    slug,
    name: name ?? 'Altar de muertos',
    createdAt: new Date().toISOString(),
    objects,
    photo: photo ?? null,
    clothColor: clothColor ?? null,
  }
  localStorage.setItem(SHARED_PREFIX + slug, JSON.stringify(payload))
  return slug
}

export function loadSharedAltar(slug) {
  try {
    const raw = localStorage.getItem(SHARED_PREFIX + slug)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
