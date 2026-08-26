import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5183/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);
await page.getByText('Entendido, ¡vamos!', { exact: true }).click().catch(()=>{});
await page.waitForTimeout(400);
await page.getByText('Velas', { exact: false }).first().click().catch(()=>{});
await page.waitForTimeout(300);
const modelBtn = page.locator('.model-btn').filter({ hasText: /vela/i }).first();

const client = await page.context().newCDPSession(page);
await client.send('HeapProfiler.enable');

for (let i = 0; i < 30; i++) {
  await modelBtn.click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);
await client.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(300);

const usage = await client.send('Runtime.getHeapUsage');
console.log('JS heap used (MB):', (usage.usedSize / 1024 / 1024).toFixed(1));
console.log('JS heap total (MB):', (usage.totalSize / 1024 / 1024).toFixed(1));

const info = await page.evaluate(() => performance.memory ? {
  used: performance.memory.usedJSHeapSize,
  total: performance.memory.totalJSHeapSize,
} : null);
console.log('performance.memory (MB):', info ? (info.used/1024/1024).toFixed(1) : 'n/a');

await browser.close();
