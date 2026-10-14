import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';

/* global window, document */
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = new URL('./', import.meta.url);
const html = readFileSync(new URL('atlas-whatsapp.html', root));
const catalogContext = { window: {} };
runInNewContext(readFileSync(new URL('catalog.js', root), 'utf8'), catalogContext);
const { groups, index, total } = catalogContext.window.EXPERIENCE;
assert.equal(total, 247, 'The video must cover every new screen in the catalog');
assert.equal(groups.length, 24, 'The video must cover all 24 journeys');
assert.ok(!Object.keys(index).some((id) => id.startsWith('LEG-')), 'Legacy screens must not be in the tour');

const recordingDir = mkdtempSync(join(tmpdir(), 'whatsapp-experience-mobile-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
let context;
let page;
let video;
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: recordingDir, size: { width: 390, height: 844 } },
  });
  page = await context.newPage();
  video = page.video();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/atlas-whatsapp.html#DEP-33`);
  assert.equal(await page.evaluate(() => window.innerWidth), 390, 'Run with a 390px mobile viewport');
  assert.equal(await page.evaluate(() => window.PROTOTYPE.getCurrent()), 'IDE-01', 'A direct personal link must show the CPF gate');
  assert.ok(!(await page.locator('#chat').innerText()).includes('João da Silva'), 'Protected data must remain hidden before the gate');

  const authenticate = async () => {
    if ((await page.evaluate(() => window.PROTOTYPE.getCurrent())) !== 'IDE-08') {
      await page.evaluate(() => window.PROTOTYPE.go('IDE-08'));
    }
    await page.locator('#message-input').fill('11111111111');
    await page.locator('#composer').evaluate((form) => form.requestSubmit());
    assert.ok(!(await page.evaluate(() => window.PROTOTYPE.getCurrent())).startsWith('IDE-'), 'Any 11-digit CPF resumes the request');
  };

  await authenticate();
  assert.equal(await page.evaluate(() => window.PROTOTYPE.getCurrent()), 'DEP-33', 'Authentication must resume the original request');

  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'e2e-video-caption';
    Object.assign(caption.style, {
      position: 'fixed', bottom: '3px', left: '5px', zIndex: '999999',
      padding: '5px 8px', borderRadius: '6px', color: '#fff',
      background: 'rgba(13, 34, 45, .88)', font: '12px/1.2 system-ui, sans-serif',
      pointerEvents: 'none', maxWidth: 'calc(100vw - 20px)',
    });
    document.body.append(caption);
  });

  let rendered = 0;
  for (const group of groups) {
    const entry = group.steps[0];
    await page.locator(`.journey-link[data-go="${entry.id}"]`).click();
    let current = await page.evaluate(() => window.PROTOTYPE.getCurrent());
    if (current === 'IDE-01' && entry.id !== 'IDE-01') {
      await authenticate();
      await page.locator('#chat button[data-go]').first().click();
      current = await page.evaluate(() => window.PROTOTYPE.getCurrent());
    }
    assert.equal(current, entry.id, `${group.code} should open through the journey navigation`);
    for (const step of group.steps) {
      if (step.id !== entry.id)
        await page.locator(`.state-button[data-go="${step.id}"]`).click();
      current = await page.evaluate(() => window.PROTOTYPE.getCurrent());
      if (current === 'IDE-01' && step.id !== 'IDE-01') {
        await authenticate();
        if (step.id !== 'IDE-03') {
          await page.locator('#chat button[data-go]').first().click();
          current = await page.evaluate(() => window.PROTOTYPE.getCurrent());
        } else current = 'IDE-03';
      }
      assert.equal(current, step.id, `${step.id} should be reachable in the mobile tour`);
      assert.equal(await page.locator('#screen-title').innerText(), step.title, `${step.id} should render its screen title`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `${step.id} must not overflow the mobile viewport`);
      await page.evaluate(({ groupTitle, position, id, title }) => {
        document.getElementById('e2e-video-caption').textContent =
          `${position}/247 · ${groupTitle} · ${id} · ${title}`;
      }, { groupTitle: group.title, position: ++rendered, id: step.id, title: step.title });
      await page.waitForTimeout(300);
    }
  }
  assert.equal(rendered, total, 'Every screen must be shown in the video');

  await page.evaluate(() => window.PROTOTYPE.go('DES-01'));
  await page.locator('input[name="service"]').first().check();
  await page.locator('#flow-form button[type="submit"]').click();
  assert.equal(await page.evaluate(() => window.PROTOTYPE.getCurrent()), 'DES-01', 'Service details stay inside the same discovery Flow');
  assert.ok((await page.locator('#flow-form').innerText()).includes('suporte ao titular e aos dependentes'));
  await page.locator('#flow-form button[type="submit"]').click();
  await page.locator('input[name="modality"][value="individual"]').check();
  await page.locator('#flow-form button[type="submit"]').click();
  assert.ok((await page.locator('#flow-form').innerText()).includes('R$ 29,90/mês'));
  await page.locator('#flow-form button[type="submit"]').click();
  await page.locator('input[name="intent"][value="finish"]').check();
  await page.locator('#flow-form button[type="submit"]').click();
  assert.equal(await page.evaluate(() => window.PROTOTYPE.getCurrent()), 'DES-11', 'Only the final discovery decision returns to chat');
  assert.deepEqual(pageErrors, [], 'No JavaScript exceptions should occur while rendering the journeys');
  console.log(`Mobile E2E passed: ${groups.length} journeys, ${rendered}/${total} catalog screens, CPF gate, single discovery Flow, and no horizontal overflow.`);
} finally {
  if (context) await context.close();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

const videoSource = await video.path();
const output = process.env.WHATSAPP_VIDEO_OUTPUT || join(tmpdir(), `experiencias-whatsapp-mobile-${Date.now()}.webm`);
renameSync(videoSource, output);
console.log(`Mobile video saved: ${output}`);
