// Dedicatoria: quién fue la persona recordada. Viaja junto a la escena, se
// guarda en el borrador privado y, al publicar, en la columna `tribute`.
// Todos los campos son opcionales: una dedicatoria vacía se guarda como null
// para que un altar sin historia no cargue estructura de más.
export const TRIBUTE_LIMITS = { personName: 80, date: 24, bio: 800, memory: 240, memories: 6 }

const isText = (value, max) => value === undefined || (typeof value === 'string' && value.length <= max)

export const isEmptyTribute = (t) =>
  !t || (!t.personName && !t.birth && !t.death && !t.bio && !(t.memories?.length))

export function isValidTribute(tribute) {
  if (tribute === null || tribute === undefined) return true
  if (typeof tribute !== 'object' || Array.isArray(tribute)) return false
  const { personName, birth, death, bio, memories } = tribute
  if (!isText(personName, TRIBUTE_LIMITS.personName) || !isText(bio, TRIBUTE_LIMITS.bio)) return false
  if (!isText(birth, TRIBUTE_LIMITS.date) || !isText(death, TRIBUTE_LIMITS.date)) return false
  if (memories === undefined) return true
  if (!Array.isArray(memories) || memories.length > TRIBUTE_LIMITS.memories) return false
  return memories.every((m) => m && typeof m === 'object' && !Array.isArray(m) && isText(m.text, TRIBUTE_LIMITS.memory))
}

// Solo persiste campos conocidos y recortados. Los ids de recuerdo se
// renumeran: sirven de clave de render, no de identidad estable.
export function cleanTribute(tribute) {
  if (!tribute || typeof tribute !== 'object' || Array.isArray(tribute)) return null
  const trim = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const clean = {
    personName: trim(tribute.personName, TRIBUTE_LIMITS.personName),
    birth: trim(tribute.birth, TRIBUTE_LIMITS.date),
    death: trim(tribute.death, TRIBUTE_LIMITS.date),
    bio: trim(tribute.bio, TRIBUTE_LIMITS.bio),
    memories: (Array.isArray(tribute.memories) ? tribute.memories : [])
      .map((m) => trim(m?.text, TRIBUTE_LIMITS.memory))
      .filter(Boolean)
      .slice(0, TRIBUTE_LIMITS.memories)
      .map((text, index) => ({ id: index + 1, text })),
  }
  return isEmptyTribute(clean) ? null : clean
}

// Todos los textos visibles pasan por el mismo filtro que el nombre del altar.
export const tributeTexts = (tribute) =>
  tribute ? [tribute.personName, tribute.bio, ...(tribute.memories ?? []).map((m) => m.text)].filter(Boolean) : []
