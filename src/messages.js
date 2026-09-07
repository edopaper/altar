// Mensajes de un altar compartido, respaldados por Supabase (tabla
// `messages`). Antes vivían en localStorage: cada visitante solo veía los
// mensajes que él mismo había dejado en su propio navegador. Ahora se
// comparten de verdad y el admin puede moderarlos.
import { supabase } from './supabaseClient.js'

export const MAX_MESSAGE_LENGTH = 60
export const MAX_NAME_LENGTH = 20

import { containsForbiddenWord } from '../supabase/functions/_shared/forbidden-words.js'
export const containsBlockedWord = containsForbiddenWord

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

// Paginación por identificador: evita descargar una lista ilimitada y saltos por borrados.
export async function loadMessages(slug, { afterId = null, pageSize = 50 } = {}) {
  const size = Math.max(1, Math.min(100, Math.floor(pageSize) || 50))
  let query = supabase.from('messages').select('id, text, author, created_at')
    .eq('slug', slug).order('id', { ascending: true }).limit(size + 1)
  if (afterId !== null) query = query.gt('id', afterId)
  const { data, error } = await query
  if (error) throw error
  const items = (data ?? []).slice(0, size)
  return { items, hasMore: (data?.length ?? 0) > size, nextCursor: items.at(-1)?.id ?? afterId }
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
