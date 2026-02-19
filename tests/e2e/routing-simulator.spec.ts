import { test, expect } from '@playwright/test';

test('routing simulator returns dns and final outbound decisions', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'kylith_sso_session_v1',
      JSON.stringify({ accessToken: 'mock-token', tokenType: 'Bearer' }),
    );
  });

  await page.goto('/routing');
  await expect(page.getByRole('heading', { name: 'Routing Policies' })).toBeVisible();

  await page.getByPlaceholder('e.g. connect-api-prod.kuainiu.chat').fill('connect-api-prod.kuainiu.chat');
  await page.locator('select').first().selectOption('tcp');
  await page.getByPlaceholder('443').fill('443');
  await page.getByRole('button', { name: 'Run Simulation' }).click();

  await expect(page.getByText('DNS Decision')).toBeVisible();
  await expect(page.getByText('Final Outbound')).toBeVisible();
  await expect(page.getByText(/^server:/)).toBeVisible();
});
