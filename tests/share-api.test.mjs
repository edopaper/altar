import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readJsonBody } from '../supabase/functions/_shared/request-json.js'
const shape = { id: 1, name: 'Recuerdo', type: 'shape', shapeKind: 'cube', position: [0, 2, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }
let handler
let clientCalls = 0
const writes = []
let testUser = { id: 'user-1' }
let existingOwner = null
let lookupMissing = false
let storedRevision = 0
let insertFailure = null
let uploads = 0
let removals = 0
globalThis.__edgeTestClient = () => {
  clientCalls++
  return {
    auth: { getUser: async () => ({ data: { user: testUser }, error: null }) },
    rpc: (name, args) => {
      if (name === 'commit_altar_draft') {
        writes.push({ ...args.p_content, photo_url: args.p_photo_url, owner_id: args.p_user, publish: args.p_publish, revision: args.p_revision })
        return { data: { slug: args.p_slug, revision: args.p_revision + 1, is_published: args.p_publish }, error: insertFailure }
      }
      return { data: true, error: null, single: async () => ({ data: { allowed: true, remaining: 4 }, error: null }) }
    },
    from: (table) => table === 'altar_drafts' ? ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { revision: storedRevision }, error: null }) }) }) }) : ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lookupMissing ? null : { edit_token: 'valid-token', owner_id: existingOwner, photo_url: 'https://example.test/photo.jpg' }, error: null }) }) }),
      insert: async (data) => { writes.push(data); return { error: insertFailure } },
      update: (data) => ({ eq: async () => { writes.push(data); return { error: null } } }),
    }),
    storage: { from: () => ({ upload: async () => { uploads++; return { error: null } }, remove: async () => { removals++; return { error: null } }, getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/photo.jpg' } }) }) },
  }
}
globalThis.Deno = { env: { get: () => 'mock' }, serve: (fn) => { handler = fn } }
const compiled = await build({ entryPoints: ['supabase/functions/share-altar/index.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'mock-supabase', setup(build) {
  build.onResolve({ filter: /^https:\/\/esm.sh\// }, (args) => ({ path: args.path, namespace: 'mock' }))
  build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const createClient = () => globalThis.__edgeTestClient()' }))
} }] })
await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const request = (body) => new Request('http://example.test/share', { method: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify(body) })
test('API rechaza objetos y colores inválidos antes de acceder a la base de datos', async () => {
  const before = clientCalls
  for (const body of [{ objects: [null] }, { objects: [shape, shape] }, { objects: [shape], clothColor: 'red' }, { objects: [], name: {} }, { objects: [{ ...shape, type: 'model', modelPath: 'https://example.test/evil.glb' }] }]) {
    const result = await handler(request(body))
    assert.equal(result.status, 400)
  }
  assert.equal(clientCalls, before)
})
test('API crea una escena limpia y actualiza solo con el token correcto', async () => {
  let result = await handler(request({ objects: [{ ...shape, extra: 'discard' }], name: 'Mi computadora' }))
  assert.equal(result.status, 200)
  const created = await result.json()
  assert.ok(created.slug)
  assert.ok(created.editToken)
  assert.equal('extra' in writes.at(-1).objects[0], false)
  result = await handler(request({ objects: [shape], slug: created.slug, editToken: 'bad' }))
  assert.equal(result.status, 403)
  const count = writes.length
  result = await handler(request({ objects: [shape], slug: created.slug, editToken: 'valid-token' }))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).updated, true)
  assert.equal(writes.length, count + 1)
})
test('API responde 400 ante base64 inválido, sin lanzar una excepción', async () => {
  const response = await handler(request({ objects: [shape], photo: 'data:image/jpeg;base64,%%%' }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /Foto inválida/)
})
test('lector limita cuerpos con y sin Content-Length', async () => {
  assert.deepEqual(await readJsonBody(request({ name: 'José' }), 64), { name: 'José' })
  await assert.rejects(readJsonBody(request({ text: 'a'.repeat(100) }), 64), (error) => error.status === 413)
  await assert.rejects(readJsonBody(new Request('http://example.test', { method: 'POST', headers: { 'content-length': '100' }, body: '{}' }), 64), (error) => error.status === 413)
})

test('guardar requiere una cuenta autenticada', async () => {
  testUser = null
  const before = writes.length
  const response = await handler(request({ objects: [shape] }))
  assert.equal(response.status, 401)
  assert.equal(writes.length, before)
  testUser = { id: 'user-1' }
})
test('un token antiguo no permite editar el altar de otra cuenta', async () => {
  existingOwner = 'user-2'
  const before = writes.length
  const response = await handler(request({ objects: [shape], slug: 'abc12', editToken: 'valid-token' }))
  assert.equal(response.status, 403)
  assert.equal(writes.length, before)
  existingOwner = null
})
test('el propietario actualiza sin token y conserva la fotografía remota', async () => {
  existingOwner = 'user-1'
  const response = await handler(request({ objects: [shape], slug: 'abc12', photo: 'https://example.test/photo.jpg' }))
  assert.equal(response.status, 200)
  assert.equal(writes.at(-1).photo_url, 'https://example.test/photo.jpg')
  assert.equal(writes.at(-1).owner_id, 'user-1')
  existingOwner = null
})
test('el límite de base de datos se devuelve como un conflicto de cupo', async () => {
  insertFailure = { code: 'P0001' }
  const response = await handler(request({ objects: [shape] }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /3 altares/)
  insertFailure = null
})

test('guardar una foto privada no la sube al bucket público', async () => {
  const before = uploads
  const response = await handler(request({ objects: [shape], action: 'save', photo: 'data:image/jpeg;base64,/9j/' }))
  assert.equal(response.status, 200)
  assert.equal(uploads, before)
  assert.equal(writes.at(-1).publish, false)
  assert.equal(writes.at(-1).photo, 'data:image/jpeg;base64,/9j/')
})
test('publicar sube una nueva imagen y usa la revisión enviada', async () => {
  storedRevision = 7
  const before = uploads
  existingOwner = 'user-1'
  const response = await handler(request({ objects: [shape], slug: 'abc12', revision: 7, action: 'publish', photo: 'data:image/jpeg;base64,/9j/' }))
  assert.equal(response.status, 200)
  assert.equal(uploads, before + 1)
  assert.equal(writes.at(-1).revision, 7)
  assert.equal(writes.at(-1).publish, true)
  storedRevision = 0
  existingOwner = null
})
test('un conflicto devuelve 409 y limpia la foto subida sin sobrescribir la anterior', async () => {
  insertFailure = { code: '40001' }
  const before = removals
  const response = await handler(request({ objects: [shape], action: 'publish', photo: 'data:image/jpeg;base64,/9j/' }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).conflict, true)
  assert.equal(removals, before + 1)
  insertFailure = null
})
test('la API rechaza acciones y revisiones inválidas', async () => {
  for (const value of [{ action: 'delete' }, { revision: -1 }, { revision: 1.5 }, { slug: '../../file' }, { draftId: 'invalid' }]) {
    assert.equal((await handler(request({ objects: [shape], ...value }))).status, 400)
  }
})

test('el primer guardado usa un identificador estable y el reintento detecta la versión existente', async () => {
  const draftId = 'a'.repeat(32)
  lookupMissing = true
  let response = await handler(request({ objects: [shape], action: 'save', draftId }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).slug, draftId)
  lookupMissing = false
  existingOwner = 'user-1'
  insertFailure = { code: '40001' }
  response = await handler(request({ objects: [shape], action: 'save', draftId }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).conflict, true)
  existingOwner = null
  insertFailure = null
})

test('una foto de una publicación anterior devuelve conflicto antes de validarla', async () => {
  existingOwner = 'user-1'
  storedRevision = 3
  const before = writes.length
  const response = await handler(request({ objects: [shape], slug: 'abc12', revision: 2, action: 'save', photo: 'https://example.test/old-photo.jpg' }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).conflict, true)
  assert.equal(writes.length, before)
  existingOwner = null
  storedRevision = 0
})
