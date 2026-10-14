// Run: node docs/prototypes/whatsapp-experience/auth-browser-test.js
/* global window, document, Event */
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { log } from 'node:console';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(readFileSync(new URL('./atlas-whatsapp.html', import.meta.url)));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const current = () => page.evaluate(() => window.PROTOTYPE.getCurrent());
  const go = (id) => page.evaluate((target) => window.PROTOTYPE.go(target), id);
  const submitCpf = async (cpf) => {
    await go('IDE-08');
    assert.equal(await page.locator('[data-open-flow]').count(), 0, 'Identity is chat-only');
    await page.locator('#message-input').fill(cpf);
    await page.locator('#composer').evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  };
  await page.goto(`${base}#DEP-33`);
  assert.equal(await current(), 'IDE-01', 'Direct personal link requires the CPF gate');
  assert.ok(!(await page.locator('#chat').innerText()).includes('João da Silva'));
  await go('IDE-03');
  assert.equal(await current(), 'IDE-01', 'Navigation to success cannot open the gate');
  await page.locator('#message-input').fill('123');
  await page.locator('#composer').evaluate((form) => form.requestSubmit());
  assert.equal(await current(), 'IDE-04', 'CPF can be typed directly at the first prompt');
  await page.locator('#message-input').fill('00000000000');
  await page.locator('#composer').evaluate((form) => form.requestSubmit());
  assert.equal(await current(), 'DEP-33', 'Retry by text resumes without opening a Flow');
  await go('IDE-05');
  await go('DEP-33');
  for (const cpf of ['123', '123456789012', 'abc12345678901', '123.456.789-0', '123 456 789 01', 'Meu CPF é 12345678901']) {
    await submitCpf(cpf);
    assert.equal(await current(), 'IDE-04', `Malformed CPF must be rejected: ${cpf}`);
    assert.ok((await page.locator('#chat').innerText()).includes('Confira o formato'));
  }
  for (const cpf of ['00000000000', '111.111.111-11', '12345678901', '987.654.321-00']) {
    await submitCpf(cpf);
    assert.equal(await current(), 'DEP-33', `Any correctly formatted CPF resumes the request: ${cpf}`);
    assert.equal(await page.locator('input[name="verification"]').count(), 0);
    assert.ok(!/identidade verificada|titular identificado/i.test(await page.locator('#chat').innerText()));
    assert.ok((await page.locator('#chat').innerText()).includes('Formato do CPF aceito'));
    assert.ok(!(await page.locator('#chat').innerText()).includes(cpf), 'Identity CPF is not repeated');
    await go('IDE-05');
    await go('DEP-33');
    assert.equal(await current(), 'IDE-01', 'Expired session blocks personal screens');
  }
  await go('DES-03');
  assert.equal(await current(), 'DES-03', 'Public service discovery remains accessible');
  const protectedCount = await page.evaluate(() => {
    let count = 0;
    for (const step of Object.values(window.EXPERIENCE.index)) {
      if (!step.requiresAuth) continue;
      window.PROTOTYPE.go(step.id);
      if (window.PROTOTYPE.getCurrent() !== 'IDE-01') throw new Error(`Gate bypass: ${step.id}`);
      count++;
    }
    window.PROTOTYPE.renderGallery();
    if (document.getElementById('gallery').textContent.includes('Ana Silva')) throw new Error('Gallery leaks personal data');
    return count;
  });
  assert.ok(protectedCount > 150, 'Personal catalog coverage');
  await page.clock.install();
  await submitCpf('000.000.000-00');
  await go('CON-02');
  assert.equal(await current(), 'CON-02');
  const renderedCount = await page.evaluate(() => {
    let count = 0;
    for (const step of Object.values(window.EXPERIENCE.index)) {
      if (['IDE-05', 'IDE-06', 'IDE-07'].includes(step.id)) continue;
      window.PROTOTYPE.go(step.id);
      if (window.PROTOTYPE.getCurrent() !== step.id) throw new Error(`Render blocked: ${step.id}`);
      count++;
    }
    window.PROTOTYPE.renderGallery();
    if (/LEG-/.test(document.getElementById('gallery').textContent)) throw new Error('Legacy gallery screens');
    return count;
  });
  await go('CON-02');
  await page.clock.fastForward(15 * 60 * 1000 + 1);
  assert.equal(await current(), 'IDE-05', 'Session expires automatically');
  await page.reload();
  await go('CON-02');
  assert.equal(await current(), 'IDE-01', 'Reload requires CPF again');
  assert.deepEqual(errors, [], 'No JavaScript rendering errors');
  log(`CPF regression passed: malformed inputs rejected, any formatted CPF accepted, ${protectedCount} protected screens, ${renderedCount} screens rendered, expiry/reload/gallery verified.`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
