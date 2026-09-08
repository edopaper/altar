import test from 'node:test'
import assert from 'node:assert/strict'
import { draftStatus } from '../src/draftState.js'

const base = { managed: true, online: true, busy: false, dirty: false, error: '', localError: false, updatedAt: null }

test('sin sesión el estado habla del navegador y nunca ofrece reintentar', () => {
  const s = draftStatus({ ...base, managed: false, dirty: true })
  assert.match(s.text, /Guardado en este navegador/)
  assert.equal(s.retry, undefined)
})

test('sin sesión un error de la nube no ofrece reintentar (no hay a dónde subirlo)', () => {
  const s = draftStatus({ ...base, managed: false, error: 'Entra con Google para guardar y publicar tu altar.' })
  assert.equal(s.tone, 'error')
  assert.equal(s.retry, null)
  assert.equal(draftStatus({ ...base, error: 'Ya tienes 3 altares.' }).retry, 'cloud')
})

test('el fallo de la copia local gana sobre cualquier otro estado', () => {
  const s = draftStatus({ ...base, localError: true, error: 'algo remoto', dirty: true })
  assert.equal(s.retry, 'local')
  assert.match(s.text, /este navegador/)
})

test('pendiente y subiendo se muestran igual: "Guardando…"', () => {
  assert.equal(draftStatus({ ...base, dirty: true }).text, 'Guardando…')
  assert.equal(draftStatus({ ...base, busy: true }).text, 'Guardando…')
})

test('sin conexión avisa antes de decir que está guardando', () => {
  const s = draftStatus({ ...base, online: false, dirty: true })
  assert.equal(s.tone, 'warn')
  assert.match(s.text, /Sin conexión/)
})

test('al día muestra la hora de la última sincronización, y tolera una fecha inválida', () => {
  const s = draftStatus({ ...base, updatedAt: '2026-09-07T18:32:00.000Z' })
  assert.equal(s.tone, 'ok')
  assert.match(s.text, /^Guardado en tu cuenta · \d{1,2}:\d{2}/)
  assert.equal(draftStatus({ ...base, updatedAt: 'ayer' }).text, 'Guardado en tu cuenta')
  assert.equal(draftStatus({ ...base }).text, 'Guardado en tu cuenta')
})

test('un altar vacío no se sube: abrir el editor no debe gastar un espacio de la cuenta', async () => {
  const { hasContent } = await import('../src/draftState.js')
  assert.equal(hasContent({ objects: [], photo: null }), false)
  assert.equal(hasContent({ objects: [{ id: 1 }], photo: null }), true)
  assert.equal(hasContent({ objects: [], photo: 'data:image/png;base64,x' }), true)
  assert.equal(hasContent(undefined), false)
})
