import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidScene, restoreScene, cleanObject } from '../supabase/functions/_shared/scene-validation.js'
import { modelPaths, paperPaths } from '../supabase/functions/_shared/catalog.js'
import { containsForbiddenWord } from '../supabase/functions/_shared/forbidden-words.js'
import { isValidTribute, cleanTribute, isEmptyTribute, tributeTexts, TRIBUTE_LIMITS } from '../supabase/functions/_shared/tribute.js'
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

test('la dedicatoria acepta campos opcionales y rechaza textos fuera de límite', () => {
  for (const valid of [null, undefined, {}, { personName: 'Ana' }, { birth: '1948', death: '2021' },
    { bio: 'a'.repeat(TRIBUTE_LIMITS.bio) }, { memories: [] },
    { memories: Array.from({ length: TRIBUTE_LIMITS.memories }, () => ({ text: 'Cantaba' })) }]) {
    assert.equal(isValidTribute(valid), true, JSON.stringify(valid))
  }
  for (const invalid of [[], 'Ana', { personName: 42 }, { personName: 'a'.repeat(TRIBUTE_LIMITS.personName + 1) },
    { birth: 'a'.repeat(TRIBUTE_LIMITS.date + 1) }, { bio: 'a'.repeat(TRIBUTE_LIMITS.bio + 1) },
    { memories: {} }, { memories: [null] }, { memories: [{ text: 'a'.repeat(TRIBUTE_LIMITS.memory + 1) }] },
    { memories: Array.from({ length: TRIBUTE_LIMITS.memories + 1 }, () => ({ text: 'x' })) }]) {
    assert.equal(isValidTribute(invalid), false, JSON.stringify(invalid))
  }
})
test('la dedicatoria se normaliza: recorta, descarta recuerdos vacíos y campos extra', () => {
  const clean = cleanTribute({ personName: '  Ana  ', birth: ' 1948 ', bio: ' Nació en Oaxaca ', secreto: 'x',
    memories: [{ id: 9, text: '  Cantaba  ' }, { text: '   ' }, { text: 'Su café' }] })
  assert.deepEqual(clean, { personName: 'Ana', birth: '1948', death: '', bio: 'Nació en Oaxaca',
    memories: [{ id: 1, text: 'Cantaba' }, { id: 2, text: 'Su café' }] })
  assert.equal(isValidTribute(clean), true)
  assert.equal('secreto' in clean, false)
  for (const empty of [null, {}, { personName: '   ' }, { memories: [{ text: '' }] }]) {
    assert.equal(cleanTribute(empty), null, JSON.stringify(empty))
    assert.equal(isEmptyTribute(cleanTribute(empty)), true)
  }
  assert.equal(cleanTribute({ memories: Array.from({ length: 20 }, () => ({ text: 'x' })) }).memories.length, TRIBUTE_LIMITS.memories)
})
test('la moderación alcanza todos los textos visibles de la dedicatoria', () => {
  const tribute = cleanTribute({ personName: 'Ana', bio: 'Vivió aquí', memories: [{ text: 'Era un idiota' }] })
  assert.deepEqual(tributeTexts(tribute), ['Ana', 'Vivió aquí', 'Era un idiota'])
  assert.equal(tributeTexts(tribute).some(containsForbiddenWord), true)
  assert.deepEqual(tributeTexts(null), [])
})
