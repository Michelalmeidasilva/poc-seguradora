import { expect, test } from '@playwright/test';

test('product sheet matches the clear atlas surface and remains usable at mobile and desktop widths', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Conhecer produtos', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Selecionar uma opção', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Conhecer produtos' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.flow-body').first()).toBeVisible();
  await expect(page.locator('.flow-sheet__panel')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const cta = await dialog
      .getByRole('button', { name: 'Ver detalhes', exact: true })
      .boundingBox();
    expect(cta).not.toBeNull();
    expect(cta!.y + cta!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: test.info().outputPath(`DES-01-${viewport.width}.png`) });
  }
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
