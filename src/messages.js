// Mensajes de un altar compartido, respaldados por Supabase (tabla
// `messages`). Antes vivían en localStorage: cada visitante solo veía los
// mensajes que él mismo había dejado en su propio navegador. Ahora se
// comparten de verdad y el admin puede moderarlos.
import { supabase } from './supabaseClient.js'

export const MAX_MESSAGE_LENGTH = 60
export const MAX_NAME_LENGTH = 20

// Chequeo rápido en el cliente para feedback inmediato antes de llamar a la
// Edge Function; la validación real (fuente de verdad) pasa por el server.
const BLOCKLIST = [
  'puto', 'puta', 'putos', 'putas',
  'maricon', 'pendejo', 'pendeja', 'pendejos', 'pendejas',
  'mierda', 'verga', 'cabron', 'cabrona',
  'idiota', 'estupido', 'estupida', 'imbecil',
  'zorra', 'perra', 'joder', 'coño', 'carajo',
  'nazi',
]

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
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

// Todos los mensajes visibles de un altar, del más viejo al más nuevo.
export async function loadMessages(slug) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, text, author, created_at')
    .eq('slug', slug)
    .order('created_at', { ascending: true })

  if (error) return []
  return data
}

export async function saveMessage(slug, { text, author }) {
  const validated = validateMessage(text)
  if (!validated.ok) return validated

  const { data, error } = await supabase.functions.invoke('add-message', {
    body: { slug, text: validated.text, author },
  })

  if (error) {
    let message = 'No se pudo publicar el mensaje.'
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {
      // Sin body legible (ej. error de red): se usa el mensaje genérico.
    }
    return { ok: false, error: message }
  }

  return { ok: true, message: data.message }
}

export async function reportMessage(messageId) {
  const { data, error } = await supabase.functions.invoke('report-message', {
    body: { messageId },
  })

  if (error) {
    let message = 'No se pudo reportar el mensaje.'
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
