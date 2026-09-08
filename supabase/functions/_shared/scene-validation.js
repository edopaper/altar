import { modelPaths, paperPaths } from './catalog.js'
export const MAX_OBJECTS = 150
const models = new Set(modelPaths)
const papers = new Set(paperPaths)
const shapes = new Set(['cube', 'sphere', 'cone'])
export const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const vector = (value, max) => Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max)
export function isValidObject(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false
  if (!Number.isSafeInteger(object.id) || object.id < 1) return false
  if (typeof object.name !== 'string' || !object.name.trim() || object.name.length > 120) return false
  if (!vector(object.position, 1000) || !vector(object.rotation, 10000) || !vector(object.scale, 100)) return false
  if (object.scale.some((n) => Math.abs(n) < 0.001) || !isColor(object.color)) return false
  if (object.locked !== undefined && typeof object.locked !== 'boolean') return false
  if (object.configuredScale !== undefined && typeof object.configuredScale !== 'boolean') return false
  if (object.type === 'shape') return shapes.has(object.shapeKind)
  if (object.type === 'model') return models.has(object.modelPath)
  if (object.type === 'paper') return papers.has(object.paperPath)
  return false
}
export function isValidScene(objects) {
  return Array.isArray(objects) && objects.length <= MAX_OBJECTS && objects.every(isValidObject) && new Set(objects.map((o) => o.id)).size === objects.length
}
// Solo persiste campos conocidos: los campos adicionales no aumentan el payload guardado.
export function cleanObject(o) {
  return { id: o.id, type: o.type, name: o.name.trim(), position: o.position, rotation: o.rotation,
    scale: o.scale, color: o.color, locked: o.locked ?? false,
    ...(o.type === 'shape' ? { shapeKind: o.shapeKind } : o.type === 'model' ? { modelPath: o.modelPath, ...(o.configuredScale === true ? { configuredScale: true } : {}) } : { paperPath: o.paperPath }) }
}
export function restoreScene(objects) {
  if (!Array.isArray(objects)) return []
  const seen = new Set()
  return objects.filter((o) => {
    if (!isValidObject(o) || seen.has(o.id)) return false
    seen.add(o.id)
    return true
  }).slice(0, MAX_OBJECTS).map(cleanObject)
}
