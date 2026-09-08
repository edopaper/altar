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
