import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
let protocol = 1
const requests = []
globalThis.__storageTestClient = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) },
  functions: { invoke: async (_name, { body }) => {
    requests.push(body)
    return { data: body.action === 'capabilities' ? { draftProtocol: protocol } : { slug: 'saved', revision: 1 }, error: null }
  } },
}
const bundle = await build({ entryPoints: ['src/storage.js'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'mock-client', setup(build) {
  build.onResolve({ filter: /supabaseClient\.js$/ }, () => ({ path: 'mock', namespace: 'mock' }))
  build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase = globalThis.__storageTestClient' }))
} }] })
const { saveSharedAltar } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
test('un servidor antiguo nunca recibe el contenido de un borrador privado', async () => {
  await assert.rejects(saveSharedAltar({ objects: [], managed: true, action: 'save' }), /guardado privado/)
  assert.deepEqual(requests, [{ action: 'capabilities' }])
})
test('un servidor compatible recibe guardar y publicar como acciones distintas', async () => {
  protocol = 2
  await saveSharedAltar({ objects: [], managed: true, action: 'save', revision: 2, slug: 'saved' })
  assert.equal(requests.at(-1).action, 'save')
  assert.equal(requests.at(-1).revision, 2)
  await saveSharedAltar({ objects: [], managed: true, action: 'publish', revision: 3, slug: 'saved' })
  assert.equal(requests.at(-1).action, 'publish')
})
