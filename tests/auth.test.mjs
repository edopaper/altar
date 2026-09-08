import test from 'node:test'
import assert from 'node:assert/strict'
import { rememberLoginRoute, consumeLoginRoute, POST_LOGIN_REDIRECT_KEY, USER_LOGIN_REDIRECT_KEY, getLoginErrorMessage } from '../src/auth.js'
const memory = () => {
  const values = new Map()
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }
}
test('el último login conserva la ruta del altar y descarta un retorno admin anterior', () => {
  const storage = memory()
  rememberLoginRoute(POST_LOGIN_REDIRECT_KEY, '#/admin', storage)
  rememberLoginRoute(USER_LOGIN_REDIRECT_KEY, '#/ver/abc123', storage)
  assert.equal(consumeLoginRoute(storage), '#/ver/abc123')
  assert.equal(consumeLoginRoute(storage), null)
})
test('el retorno rechaza rutas externas y tolera almacenamiento bloqueado', () => {
  const storage = memory()
  storage.setItem(USER_LOGIN_REDIRECT_KEY, 'https://example.com')
  assert.equal(consumeLoginRoute(storage), null)
  const blocked = { getItem() { throw Error() }, removeItem() { throw Error() } }
  assert.doesNotThrow(() => rememberLoginRoute(USER_LOGIN_REDIRECT_KEY, '#/', blocked))
  assert.equal(consumeLoginRoute(blocked), null)
})
test('el error indica cuando falta habilitar Google', () => {
  assert.match(getLoginErrorMessage({ message: 'Unsupported provider: provider is not enabled' }), /habilitado/)
  assert.match(getLoginErrorMessage(new Error('network')), /conexión/)
})

test('entrar con Google desde el editor deja a salvo el borrador de invitado y la ruta de vuelta', async () => {
  const { startGoogleLogin } = await import('../src/auth.js')
  const local = memory()
  const session = memory()
  local.setItem('workspace-v2', '{"content":{"objects":[1]}}')
  globalThis.window = { location: { hash: '', origin: 'https://altar.test', pathname: '/' } }
  const calls = []
  const client = { auth: { signInWithOAuth: async (opts) => { calls.push(opts); return { error: null } } } }
  await startGoogleLogin(client, { local, session })
  assert.equal(session.getItem('altar-login-draft'), '{"content":{"objects":[1]}}')
  assert.equal(consumeLoginRoute(session), '#/')
  assert.equal(calls[0].options.redirectTo, 'https://altar.test/')
})

test('si el proveedor falla, entrar con Google lanza para que la pantalla lo muestre', async () => {
  const { startGoogleLogin } = await import('../src/auth.js')
  globalThis.window = { location: { hash: '#/', origin: 'https://altar.test', pathname: '/' } }
  const client = { auth: { signInWithOAuth: async () => ({ error: new Error('Unsupported provider') }) } }
  await assert.rejects(
    () => startGoogleLogin(client, { local: memory(), session: memory() }),
    (err) => getLoginErrorMessage(err).includes('Google aún no está habilitado'),
  )
})
