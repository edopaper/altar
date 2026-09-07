import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreDraft, contentOf, fingerprint } from '../src/draftState.js'
import { TEMPLATES, createTemplate } from '../src/templates.js'
import { isValidScene } from '../supabase/functions/_shared/scene-validation.js'
const remote = { slug: 'test', name: 'Nueva versión', objects: [], revision: 3, is_published: true }
test('una caché sincronizada no oculta cambios de otro dispositivo', () => {
  const content = { ...contentOf(remote), name: 'Versión antigua' }
  const result = restoreDraft(remote, { content, revision: 2, baseline: fingerprint(content) })
  assert.equal(result.content.name, remote.name)
  assert.equal(result.revision, 3)
  assert.equal(result.conflict, undefined)
})
test('los cambios locales se recuperan y un conflicto requiere elección', () => {
  const content = { ...contentOf(remote), name: 'Mi edición sin guardar' }
  const result = restoreDraft(remote, { content, revision: 2, baseline: 'old' })
  assert.equal(result.content.name, content.name)
  assert.equal(result.conflict, remote)
  assert.equal(result.revision, 2)
})
test('un borrador compatible conserva cambios sin inventar conflictos', () => {
  const stored = { content: contentOf(remote), revision: 3, baseline: 'different' }
  assert.equal(restoreDraft(remote, stored).conflict, null)
  assert.deepEqual(restoreDraft(null, stored), stored)
})
test('las tres plantillas contienen escenas válidas e independientes', () => {
  assert.equal(TEMPLATES.length, 3)
  for (const template of TEMPLATES) {
    const result = createTemplate(template.id)
    assert.equal(isValidScene(result.objects), true, template.id)
    result.objects[0].position[0] = 999
    assert.notEqual(createTemplate(template.id).objects[0].position[0], 999)
  }
})

test('recargar no inventa cambios por campos opcionales u orden de propiedades', () => {
  const object = { id: 1, type: 'shape', shapeKind: 'cube', modelPath: null, name: 'Cubo', position: [0, 2, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }
  const original = { objects: [object], photo: null, clothColor: '#ffffff', name: 'Mi altar' }
  const normalized = { name: 'Mi altar', photo: null, clothColor: '#ffffff', objects: [{ color: '#ffffff', ...object, locked: false }] }
  assert.equal(fingerprint(original), fingerprint(normalized))
  const result = restoreDraft(null, { content: normalized, baseline: JSON.stringify(original), revision: 2 })
  assert.equal(fingerprint(result.content), result.baseline)
})
