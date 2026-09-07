import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
function findBrowser(dir) {
  if (!existsSync(dir)) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && ['chrome-headless-shell', 'chrome-headless-shell.exe'].includes(entry.name)) return full
    if (entry.isDirectory()) { const found = findBrowser(full); if (found) return found }
  }
}
const executablePath = process.env.CHROMIUM_PATH || findBrowser(path.join(os.homedir(), 'Library/Caches/ms-playwright')) || findBrowser(path.join(os.homedir(), '.cache/ms-playwright'))
if (!executablePath) throw new Error('Define CHROMIUM_PATH o instala Chromium de Playwright.')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-unsafe-swiftshader'] })
const baseURL = process.argv[2] || process.env.TEST_URL || 'http://127.0.0.1:5173'
const failures = []
const shape = { id: 1, type: 'shape', shapeKind: 'cube', name: 'Recuerdo', position: [0, 2, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }
let debugPage
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  context.setDefaultTimeout(60000)
  const page = await context.newPage()
  debugPage = page
  page.on('pageerror', (error) => { failures.push(error.message); console.error(error.message) })
  const shares = []
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', user_metadata: { full_name: 'Prueba' } }
  const project = new URL(readFileSync('.env', 'utf8').match(/^VITE_SUPABASE_URL=(.*)$/m)[1].trim()).hostname.split('.')[0]
  const draftKey = `account:${user.id}:root:workspace-v2`
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: 9999999999 })).toString('base64url')}.test`
  await context.addInitScript(({ key, token, user }) => {
    localStorage.setItem('altar-quality-v1', 'low')
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: 9999999999, expires_in: 999999, token_type: 'bearer', user }))
  }, { key: `sb-${project}-auth-token`, token, user })
  let remote = null
  let published = null
  let failAltar = true
  const allMessages = Array.from({ length: 65 }, (_, i) => ({ id: i + 1, text: `Recuerdo ${i + 1}`, author: 'Familia', created_at: '2026-09-06T12:00:00Z' }))
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === baseURL) return route.continue()
    if (url.pathname.endsWith('/functions/v1/share-altar')) {
      const body = route.request().postDataJSON()
      if (body.action === 'capabilities') return route.fulfill({ json: { draftProtocol: 2 } })
      shares.push(body)
      if (remote && body.revision !== remote.revision) return route.fulfill({ status: 409, json: { error: 'Hay cambios más recientes.', conflict: true } })
      remote = { slug: 'test1', name: body.name, objects: body.objects, photo_url: body.photo, cloth_color: body.clothColor, revision: (remote?.revision ?? 0) + 1, updated_at: new Date().toISOString(), is_published: body.action === 'publish' || !!remote?.is_published, status: 'visible', created_at: new Date().toISOString() }
      if (body.action === 'publish') published = structuredClone(remote)
      return route.fulfill({ json: { slug: remote.slug, revision: remote.revision, updated_at: remote.updated_at, is_published: remote.is_published, updated: shares.length > 1 } })
    }
    if (url.pathname.endsWith('/rest/v1/rpc/my_altars')) return route.fulfill({ json: remote ? [remote] : [] })
    if (url.pathname.endsWith('/rest/v1/altars')) {
      if (failAltar) { return route.fulfill({ status: 503, json: { message: 'temporary error' } }) }
      return route.fulfill({ json: { slug: 'test1', name: 'Altar de prueba', objects: [shape], status: 'visible', photo_url: null, cloth_color: '#ffffff' } })
    }
    if (url.pathname.endsWith('/rest/v1/messages')) {
      const after = Number((url.searchParams.get('id') || 'gt.0').slice(3))
      return route.fulfill({ json: allMessages.filter((m) => m.id > after).slice(0, Number(url.searchParams.get('limit') || 51)) })
    }
    return route.abort()
  })
  await page.goto(baseURL)
  await page.getByRole('dialog', { name: 'Bienvenido a tu altar' }).waitFor()
  await page.getByRole('button', { name: 'Crear mi altar' }).click()
  await page.getByRole('button', { name: 'Cubo', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2'))) || '{"content":{"objects":[]}}').content.objects.length === 1)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects.length === 0)
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects.length === 1)
  await page.reload()
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects.length), 1)
  await page.getByRole('button', { name: 'Ayuda', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Ayuda', exact: true })
  await help.waitFor()
  await help.getByRole('button', { name: 'Cerrar', exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Cerrar ayuda')
  await page.keyboard.press('Escape')
  await help.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Compartir altar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Vista previa del altar' }).getByRole('button', { name: 'Publicar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartir altar', exact: true }).waitFor()
  assert.equal(shares.length, 1)
  assert.equal(shares[0].objects.length, 1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Cubo', exact: true }).click()
  await page.getByRole('button', { name: 'Compartir altar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Vista previa del altar' }).getByRole('button', { name: 'Publicar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartir altar', exact: true }).waitFor()
  assert.equal(shares.length, 2)
  assert.equal(shares[1].revision, 1)
  assert.equal(shares[1].action, 'publish')
  assert.equal(shares[1].objects.length, 2)
  await page.keyboard.press('Escape')
  console.log('OK: crear, guardar, recargar, deshacer/rehacer, foco, compartir y publicar con control de versión')
  await page.waitForTimeout(500)
  await page.locator('.object-item').first().click()
  await page.locator('.object-item').nth(1).click({ modifiers: ['Shift'] })
  await page.getByText('2 objetos seleccionados.', { exact: false }).waitFor()
  const beforeDrag = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects)
  await page.mouse.move(675, 450)
  await page.mouse.down()
  await page.mouse.move(730, 450, { steps: 10 })
  await page.waitForTimeout(500)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects), beforeDrag)
  await page.mouse.up()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects[0].position[0] > 0.05)
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects)
  assert.ok(Math.abs(moved[0].position[0] - moved[1].position[0]) < 0.0001)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects[0].position[0] === 0)
  console.log('OK: arrastre de grupo confirma solo al soltar y se deshace en un paso')

  await page.locator('#altar-name').fill('Mi borrador privado')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await page.getByText(/Sincronizado con tu cuenta/).waitFor()
  assert.equal(remote.name, 'Mi borrador privado')
  assert.notEqual(published.name, remote.name)
  assert.equal(shares.at(-1).action, 'save')
  // A second device saves while this editor has unsynchronized local changes.
  await page.locator('#altar-name').fill('Cambios de este navegador')
  remote = { ...remote, name: 'Cambios desde otro dispositivo', revision: remote.revision + 1 }
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  const conflict = page.getByRole('dialog', { name: 'Cambios en otro dispositivo' })
  await conflict.waitFor()
  await conflict.getByRole('button', { name: 'Usar versión de mi cuenta' }).click()
  assert.equal(await page.locator('#altar-name').inputValue(), remote.name)
  await page.getByRole('button', { name: 'Recuperar copia anterior' }).click()
  assert.equal(await page.locator('#altar-name').inputValue(), 'Cambios de este navegador')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await page.getByText(/Sincronizado con tu cuenta/).waitFor()
  // A clean local cache should accept the newer remote version after reload.
  await page.waitForTimeout(500)
  remote = { ...remote, name: 'Última versión remota', revision: remote.revision + 1 }
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#altar-name')?.value === 'Última versión remota')
  await page.getByRole('button', { name: 'Plantillas', exact: true }).click()
  await page.getByRole('button', { name: /Tradicional.*Cempasúchil/ }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith(':root:workspace-v2')))).content.objects.length === 10)
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await page.getByText(/Sincronizado con tu cuenta/).waitFor()
  assert.equal(remote.objects.length, 10)
  assert.equal(published.objects.length, 2)
  await page.locator('#altar-name').fill('Sincronización automática')
  await page.waitForFunction(() => document.querySelector('.altar-name-control')?.textContent.includes('Sincronizado con tu cuenta'), null, { timeout: 30000 })
  assert.equal(remote.name, 'Sincronización automática')
  // Going offline keeps edits locally and reconnecting syncs safely.
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await page.locator('#altar-name').fill('Recuerdo sin conexión')
  await page.getByText(/Sin conexión. Tus cambios/).waitFor()
  await context.setOffline(false)
  await page.waitForFunction(() => document.querySelector('.altar-name-control')?.textContent.includes('Sincronizado con tu cuenta'), null, { timeout: 30000 })
  assert.equal(remote.name, 'Recuerdo sin conexión')
  console.log('OK: borrador privado, conflicto entre dispositivos, recuperación, plantillas y sincronización automática/offline')

  const previousRemote = remote
  remote = null
  await page.goto(`${baseURL}/#/mis-altares/nuevo/prueba`)
  await page.getByRole('button', { name: 'Plantillas', exact: true }).click()
  await page.getByRole('button', { name: /Sencillo.*Velas/ }).click()
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await page.getByText(/Sincronizado con tu cuenta/).waitFor()
  assert.equal(remote.is_published, false)
  await page.reload()
  await page.getByRole('button', { name: 'Publicar altar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Vista previa del altar' }).getByRole('button', { name: 'Publicar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartir altar', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(remote.is_published, true)
  console.log('OK: crear desde Mis altares, guardar en privado, recargar y publicar')
  remote = previousRemote

  await page.goto(`${baseURL}/#/ver/test1`)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor()
  failAltar = false
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await page.getByRole('button', { name: /Ver mensajes/ }).click()
  await page.getByRole('button', { name: 'Cargar más mensajes' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.message-list-item').length === 65)
  await page.getByRole('button', { name: 'Actualizar mensajes' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.message-list-item').length === 50)
  await page.keyboard.press('Escape')
  console.log('OK: error de conexión, reintento, mensajes paginados y actualización')
  await page.goto(baseURL)
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError') } })
  await page.getByRole('button', { name: 'Cubo', exact: true }).click()
  await page.getByText('No se pudo guardar la copia local.', { exact: false }).waitFor()
  assert.equal(failures.length, 0, failures.join('\n'))
  console.log('OK: fallo de almacenamiento visible, sin errores de JavaScript')
  await context.close()
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await mobile.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
  mobile.setDefaultTimeout(60000)
  const phone = await mobile.newPage()
  await phone.goto(baseURL)
  await phone.getByRole('button', { name: 'Crear mi altar' }).click()
  await phone.locator('canvas').waitFor()
  await phone.getByRole('button', { name: 'Plantillas', exact: true }).click()
  await phone.getByRole('button', { name: /Sencillo.*Velas/ }).click()
  await phone.screenshot({ path: '/tmp/altar-mobile.png' })
  await phone.locator('.menu-hide-btn').click()
  await phone.waitForLoadState('networkidle')
  await phone.screenshot({ path: '/tmp/altar-mobile-scene.png' })
  console.log('OK: editor móvil y plantilla; capturas /tmp/altar-mobile.png y /tmp/altar-mobile-scene.png')
  await mobile.close()
} catch (error) {
  await debugPage?.screenshot({ path: '/tmp/altar-test-failure.png' }).catch(() => {})
  throw error
} finally { await browser.close() }
