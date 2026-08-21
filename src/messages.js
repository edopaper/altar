export const MAX_MESSAGE_LENGTH = 60
export const MAX_NAME_LENGTH = 20

const STORAGE_PREFIX = 'altar-messages-v1:'
const MAX_STORED_MESSAGES = 200 // tope por altar para no crecer sin límite

// Filtro base de palabras (español, sin acentos): primera barrera contra
// insultos obvios. No es moderación real — en producción conviene un
// servicio dedicado (o revisión humana) antes de publicar en un backend
// compartido; esto solo cubre el MVP mientras todo vive en localStorage.
const BLOCKLIST = [
  'puto', 'puta', 'putos', 'putas',
  'maricon', 'pendejo', 'pendeja', 'pendejos', 'pendejas',
  'mierda', 'verga', 'cabron', 'cabrona',
  'idiota', 'estupido', 'estupida', 'imbecil',
  'zorra', 'perra', 'joder', 'coño', 'carajo',
  'nazi',
]

// Normaliza para comparar: minúsculas, sin acentos, sin símbolos —
// dificulta el truco típico de "p.endejo" o "pendej0".
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (marcas diacríticas combinadas)
    .replace(/[^a-z0-9\s]/g, '') // quita símbolos
}

export function containsBlockedWord(text) {
  const normalized = normalize(text)
  return BLOCKLIST.some((word) => normalized.includes(word))
}

export function validateMessage(text) {
  const trimmed = (text ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return { ok: false, error: 'Escribe un mensaje.' }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Máximo ${MAX_MESSAGE_LENGTH} caracteres.` }
  }
  if (containsBlockedWord(trimmed)) {
    return { ok: false, error: 'Ese mensaje no se puede publicar.' }
  }
  return { ok: true, text: trimmed }
}

function sanitizeAuthor(name) {
  const trimmed = (name ?? '').trim().slice(0, MAX_NAME_LENGTH)
  return containsBlockedWord(trimmed) ? '' : trimmed
}

// Lectura en un único batch: todos los mensajes ligados a un altar
// compartido, para no hacer una llamada por mensaje.
export function loadMessages(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveMessage(slug, { text, author }) {
  const validated = validateMessage(text)
  if (!validated.ok) return validated

  const entry = {
    id: Math.random().toString(36).slice(2, 9),
    text: validated.text,
    author: sanitizeAuthor(author),
    createdAt: new Date().toISOString(),
  }
  const next = [...loadMessages(slug), entry].slice(-MAX_STORED_MESSAGES)
  localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify(next))
  return { ok: true, message: entry }
}
