// Run with Playwright browser_run_code_unsafe, filename pointing to this file.
/* global window, document, Event */
// The tool expects a function expression, not an exported module.
/* eslint-disable @typescript-eslint/no-unused-expressions */
async (page) => {
  const base = 'http://127.0.0.1:8765/atlas-whatsapp.html';
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.goto(`${base}?auth-test=${Date.now()}#DEP-33`);
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-01', 'Direct personal link must require authentication');
  check(!(await page.locator('#chat').innerText()).includes('João da Silva'), 'No personal data before authentication');
  await page.evaluate(() => window.PROTOTYPE.go('IDE-03'));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-01', 'Success screen cannot authenticate by navigation');
  await page.evaluate(() => window.PROTOTYPE.go('IDE-08'));
  await page.locator('input[name="authCpf"]').fill('00000000000');
  await page.locator('#flow-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-08', 'Invalid CPF must not continue');
  await page.locator('input[name="authCpf"]').fill('52998224725');
  await page.locator('#flow-form button[type="submit"]').click();
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-02', 'CPF alone must still require code');
  await page.locator('input[name="verification"]').fill('999999');
  await page.locator('#flow-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-04', 'Invalid code must fail');
  await page.evaluate(() => window.PROTOTYPE.go('IDE-02'));
  await page.locator('input[name="verification"]').fill('123456');
  await page.locator('#flow-form button[type="submit"]').click();
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-03', 'Valid code completes demonstration authentication');
  await page.locator('#chat button').first().click();
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'DEP-33', 'Resume the original request');
  await page.evaluate(() => window.PROTOTYPE.go('IDE-05'));
  await page.evaluate(() => window.PROTOTYPE.go('CON-02'));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-01', 'Expired session must block personal data');
  await page.evaluate(() => window.PROTOTYPE.go('DES-03'));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'DES-03', 'Public services remain accessible');
  const protectedCount = await page.evaluate(() => {
    let count = 0;
    for (const step of Object.values(window.EXPERIENCE.index)) {
      if (!step.requiresAuth) continue;
      window.PROTOTYPE.go(step.id);
      if (window.PROTOTYPE.getCurrent() !== 'IDE-01') throw new Error(`Authentication bypass: ${step.id}`);
      count++;
    }
    window.PROTOTYPE.renderGallery();
    if (document.getElementById('gallery').textContent.includes('Ana Silva')) throw new Error('Gallery leaks personal data');
    return count;
  });
  check(protectedCount > 200, 'Personal catalog coverage');
  await page.clock.install();
  await page.evaluate(() => window.PROTOTYPE.go('IDE-02'));
  await page.locator('input[name="verification"]').fill('123456');
  await page.locator('#flow-form button[type="submit"]').click();
  await page.evaluate(() => window.PROTOTYPE.go('CON-02'));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'CON-02', 'Code-only path for previously identified account');
  await page.clock.fastForward(15 * 60 * 1000 + 1);
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-05', 'Session expires automatically');
  await page.reload();
  await page.evaluate(() => window.PROTOTYPE.go('CON-02'));
  check(await page.evaluate(() => window.PROTOTYPE.getCurrent()) === 'IDE-01', 'Reload requires authentication again');
  return 'Authentication regression checks passed';
}
