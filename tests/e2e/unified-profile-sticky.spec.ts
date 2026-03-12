import { test, expect } from '@playwright/test';

test('right panel should stop near top when scrolling', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sso_session_v1',
      JSON.stringify({ accessToken: 'mock-token', tokenType: 'Bearer' }),
    );
  });

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Unified Profile' })).toBeVisible();

  const actionsTitle = page.getByText('Actions').first();
  await expect(actionsTitle).toBeVisible();

  const yBefore = (await actionsTitle.boundingBox())?.y ?? 0;

  const main = page.locator('main');
  await main.evaluate((el) => {
    el.scrollTo({ top: 1200, behavior: 'auto' });
  });

  await page.waitForTimeout(300);
  const yAfter = (await actionsTitle.boundingBox())?.y ?? 0;

  // Sticky panel should stay near the top band after scrolling.
  expect(yAfter).toBeLessThanOrEqual(180);
  expect(yAfter).toBeGreaterThanOrEqual(60);

  // Should have moved up from initial position, then stopped near top.
  expect(yAfter).toBeLessThan(yBefore);
});
