import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readJsonBody } from '../supabase/functions/_shared/request-json.js'
const shape = { id: 1, name: 'Recuerdo', type: 'shape', shapeKind: 'cube', position: [0, 2, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }
let handler
let clientCalls = 0
const writes = []
globalThis.__edgeTestClient = () => {
  clientCalls++
  return {
    rpc: () => ({ data: true, error: null, single: async () => ({ data: { allowed: true, remaining: 4 }, error: null }) }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { edit_token: 'valid-token' }, error: null }) }) }),
      insert: async (data) => { writes.push(data); return { error: null } },
      update: (data) => ({ eq: async () => { writes.push(data); return { error: null } } }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/photo.jpg' } }) }) },
  }
}
globalThis.Deno = { env: { get: () => 'mock' }, serve: (fn) => { handler = fn } }
const compiled = await build({ entryPoints: ['supabase/functions/share-altar/index.ts'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'mock-supabase', setup(build) {
  build.onResolve({ filter: /^https:\/\/esm.sh\// }, (args) => ({ path: args.path, namespace: 'mock' }))
  build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const createClient = () => globalThis.__edgeTestClient()' }))
} }] })
await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const request = (body) => new Request('http://example.test/share', { method: 'POST', body: JSON.stringify(body) })
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
