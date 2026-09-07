import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidScene, restoreScene, cleanObject } from '../supabase/functions/_shared/scene-validation.js'
import { modelPaths, paperPaths } from '../supabase/functions/_shared/catalog.js'
import { containsForbiddenWord } from '../supabase/functions/_shared/forbidden-words.js'
import { readLocal, writeLocal } from '../src/localStore.js'
const shape = (id = 1) => ({ id, name: 'Recuerdo', type: 'shape', shapeKind: 'cube', position: [0, 2, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#aabbcc' })
test('acepta escenas reales y su ciclo de serialización', () => {
  const scene = [shape(), { ...shape(2), type: 'model', modelPath: modelPaths[0] }, ...paperPaths.map((paperPath, i) => ({ ...shape(i + 3), type: 'paper', paperPath }))]
  assert.equal(isValidScene(scene), true)
  const restored = restoreScene(JSON.parse(JSON.stringify(scene)))
  assert.equal(isValidScene(restored), true)
  assert.deepEqual(restored.map((o) => o.position), scene.map((o) => o.position))
})
test('rechaza escenas malformadas, rutas externas y vectores peligrosos', () => {
  for (const invalid of [null, {}, [null], [shape(), shape()], Array.from({ length: 151 }, (_, i) => shape(i + 1)),
    [{ ...shape(), id: 1.5 }], [{ ...shape(), type: 'other' }], [{ ...shape(), scale: [0, 1, 1] }],
    [{ ...shape(), position: [Infinity, 0, 0] }], [{ ...shape(), rotation: [0] }],
    [{ ...shape(), name: 'a'.repeat(121) }], [{ ...shape(), color: 'url(https://other)' }],
    [{ ...shape(), type: 'model', modelPath: 'https://other/model.glb' }],
    [{ ...shape(), type: 'paper', paperPath: '/papel-cortado/../bad.svg' }]]) {
    assert.equal(isValidScene(invalid), false, JSON.stringify(invalid))
  }
})
test('restaura objetos válidos sin duplicados y descarta campos adicionales', () => {
  const restored = restoreScene([null, shape(), shape(), { ...shape(2), position: null }, shape(3)])
  assert.deepEqual(restored.map((o) => o.id), [1, 3])
  assert.equal('extra' in cleanObject({ ...shape(), extra: 'untrusted' }), false)
  assert.equal(restoreScene(Array.from({ length: 160 }, (_, i) => shape(i + 1))).length, 150)
})
test('moderación evita falsos positivos y normaliza acentos y puntuación', () => {
  for (const message of ['Mi computadora', 'Una disputa', 'Te recuerdo con cariño', 'Concha', 'Imputado']) assert.equal(containsForbiddenWord(message), false, message)
  for (const message of ['IDIOTA!', '¡imbécil!', 'hijo de puta', 'PÉNDEJO', 'coño']) assert.equal(containsForbiddenWord(message), true, message)
})
test('el almacenamiento restringido no rompe la aplicación y reporta fallos', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  assert.equal(readLocal('key', 'fallback'), 'fallback')
  assert.equal(writeLocal('key', 'value'), false)
  assert.equal(writeLocal('key', null), false)
  delete globalThis.localStorage
})
