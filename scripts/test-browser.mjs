import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
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
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(error.message))
  const shares = []
  let failAltar = true
  const allMessages = Array.from({ length: 65 }, (_, i) => ({ id: i + 1, text: `Recuerdo ${i + 1}`, author: 'Familia', created_at: '2026-09-06T12:00:00Z' }))
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === baseURL) return route.continue()
    if (url.pathname.endsWith('/functions/v1/share-altar')) {
      shares.push(route.request().postDataJSON())
      return route.fulfill({ json: { slug: 'test1', editToken: 'test-token', updated: shares.length > 1 } })
    }
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
  await page.getByRole('button', { name: 'Entendido, ¡vamos!' }).click()
  await page.getByRole('button', { name: 'Cubo', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('altar-objects-v1') || '[]').length === 1)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('altar-objects-v1')).length === 0)
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('altar-objects-v1')).length === 1)
  await page.reload()
  await page.getByText('Guardado en este navegador', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('altar-objects-v1')).length), 1)
  await page.getByRole('button', { name: 'Ayuda', exact: true }).click()
  const help = page.getByRole('dialog', { name: 'Ayuda', exact: true })
  await help.waitFor()
  await help.getByRole('button', { name: 'Cerrar', exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Cerrar ayuda')
  await page.keyboard.press('Escape')
  await help.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Compartir altar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Vista previa del altar' }).getByRole('button', { name: 'Compartir', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartir altar', exact: true }).waitFor()
  assert.equal(shares.length, 1)
  assert.equal(shares[0].objects.length, 1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Cubo', exact: true }).click()
  await page.getByRole('button', { name: 'Compartir altar', exact: true }).click()
  await page.getByRole('dialog', { name: 'Vista previa del altar' }).getByRole('button', { name: 'Compartir', exact: true }).click()
  await page.getByRole('dialog', { name: 'Compartir altar', exact: true }).waitFor()
  assert.equal(shares.length, 2)
  assert.equal(shares[1].editToken, 'test-token')
  assert.equal(shares[1].objects.length, 2)
  await page.keyboard.press('Escape')
  console.log('OK: crear, guardar, recargar, deshacer/rehacer, foco, compartir y actualizar con token')
  await page.getByText('Guardado en este navegador', { exact: true }).waitFor()
  await page.locator('.object-item').first().click()
  await page.locator('.object-item').nth(1).click({ modifiers: ['Shift'] })
  await page.getByText('2 objetos seleccionados.', { exact: false }).waitFor()
  const beforeDrag = await page.evaluate(() => JSON.parse(localStorage.getItem('altar-objects-v1')))
  await page.mouse.move(675, 450)
  await page.mouse.down()
  await page.mouse.move(730, 450, { steps: 10 })
  await page.waitForTimeout(500)
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('altar-objects-v1'))), beforeDrag)
  await page.mouse.up()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('altar-objects-v1'))[0].position[0] > 0.05)
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('altar-objects-v1')))
  assert.ok(Math.abs(moved[0].position[0] - moved[1].position[0]) < 0.0001)
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('altar-objects-v1'))[0].position[0] === 0)
  console.log('OK: arrastre de grupo confirma solo al soltar y se deshace en un paso')

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
  await page.getByText('No se pudo guardar en este navegador', { exact: false }).waitFor()
  assert.equal(failures.length, 0, failures.join('\n'))
  console.log('OK: fallo de almacenamiento visible, sin errores de JavaScript')
  await context.close()
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await mobile.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort())
  const phone = await mobile.newPage()
  await phone.goto(baseURL)
  await phone.getByRole('button', { name: 'Entendido, ¡vamos!' }).click()
  await phone.locator('canvas').waitFor()
  await phone.screenshot({ path: '/tmp/altar-mobile.png' })
  console.log('OK: editor móvil carga; captura /tmp/altar-mobile.png')
  await mobile.close()
} finally { await browser.close() }
