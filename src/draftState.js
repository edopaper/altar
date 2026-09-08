import { restoreScene } from '../supabase/functions/_shared/scene-validation.js'
import { cleanTribute } from '../supabase/functions/_shared/tribute.js'
export const contentOf = (altar) => ({ objects: altar?.objects ?? [], photo: altar?.photo_url ?? null, clothColor: altar?.cloth_color ?? '#f7f2e8', name: altar?.name ?? 'Mi altar', tribute: cleanTribute(altar?.tribute) })
// Compare persisted fields, not incidental key ordering, unused shape fields,
// or the optional `locked` default inserted when restoring a scene.
export const fingerprint = (content) => JSON.stringify({
  name: content.name?.trim() || 'Mi altar', objects: restoreScene(content.objects),
  photo: content.photo ?? null, clothColor: content.clothColor ?? '#f7f2e8',
  tribute: cleanTribute(content.tribute),
})
export function restoreDraft(remote, stored) {
  const server = contentOf(remote)
  if (stored?.baseline) {
    try { stored = { ...stored, baseline: fingerprint(JSON.parse(stored.baseline)) } } catch {}
  }
  if (!stored?.content) return { content: server, slug: remote?.slug, revision: remote?.revision ?? 0, baseline: remote?.slug ? fingerprint(server) : null, updated_at: remote?.updated_at, is_published: remote?.is_published ?? false }
  if (!remote?.slug) return stored
  // A clean cache must never mask a newer server version.
  if (fingerprint(stored.content) === stored.baseline) return { content: server, slug: remote.slug, revision: remote.revision, baseline: fingerprint(server), updated_at: remote.updated_at, is_published: remote.is_published }
  return { ...stored, conflict: stored.revision !== remote.revision ? remote : null }
}

// Un solo mensaje de estado para el borrador. Antes convivían tres textos
// (sincronización con la cuenta, copia local y visibilidad) que se
// contradecían entre sí — "Cambios pendientes de sincronizar" junto a
// "Borrador privado…" y un "Reintentar" que sin sesión nunca iba a
// funcionar. Acá se resuelven por prioridad y en una sola línea; el estado
// de publicación vive aparte, porque responde a otra pregunta (quién lo ve,
// no si se guardó).
//
// `managed` es si hay sesión: sin ella no hay a dónde subir el altar, así
// que "guardado" significa este navegador y punto, sin error ni reintento.
export function draftStatus({ managed, online, busy, dirty, error, localError, updatedAt } = {}) {
  if (localError) return { tone: 'error', text: 'No se pudo guardar en este navegador. Libera espacio e inténtalo de nuevo.', retry: 'local' }
  if (error) return { tone: 'error', text: error, retry: managed ? 'cloud' : null }
  if (!managed) return { tone: 'info', text: 'Guardado en este navegador. Entra con Google para conservarlo en tu cuenta.' }
  if (!online) return { tone: 'warn', text: 'Sin conexión. Se guarda en este navegador y se sincroniza al volver.' }
  // Pendiente y subiendo se cuentan igual: a quien arma su altar no le
  // importa si el guardado está esperando o en vuelo, solo que va solo.
  if (busy || dirty) return { tone: 'info', text: 'Guardando…' }
  if (!updatedAt) return { tone: 'ok', text: 'Guardado en tu cuenta' }
  const at = new Date(updatedAt)
  if (Number.isNaN(at.getTime())) return { tone: 'ok', text: 'Guardado en tu cuenta' }
  return { tone: 'ok', text: `Guardado en tu cuenta · ${at.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` }
}

// ¿Hay algo que valga la pena subir? Un editor recién abierto ya cuenta como
// "con cambios" (no tiene baseline todavía), así que sin esto el
// autoguardado crearía un altar vacío en la cuenta por el solo hecho de
// entrar — y cada cuenta solo tiene tres. Mismo criterio que el botón de
// compartir, que se deshabilita sin objetos ni fotografía.
export const hasContent = (content) => (content?.objects?.length ?? 0) > 0 || !!content?.photo
