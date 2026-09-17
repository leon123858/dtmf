import { test, expect } from '@playwright/test';

test('invalid trip name alerts and preserves input for retry', async ({ page }) => {
  await page.goto('/');
  const name = page.getByPlaceholder('例如: 2024 日本關西之旅');
  const submit = page.getByRole('button', { name: '開始分帳' });
  await name.fill('   ');
  const dialogPromise = page.waitForEvent('dialog');
  const firstClick = submit.click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('alert');
  expect(dialog.message()).toBe('旅程名稱不能為空。');
  await dialog.accept();
  await firstClick;
  await expect(name).toHaveValue('   ');
  await expect(submit).toBeEnabled();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Application error:', { exact: false })).toHaveCount(0);

  // Exercise the browser catch path without intercepting server-side GraphQL.
  await page.route('**/*', async route => {
    if (route.request().headers()['next-action']) await route.abort('failed');
    else await route.continue();
  });
  await name.fill('Retry trip');
  const failedDialogPromise = page.waitForEvent('dialog');
  const retryClick = submit.click();
  const failedDialog = await failedDialogPromise;
  expect(failedDialog.message()).toBe('創建新旅程失敗，請稍後再試。');
  await failedDialog.accept();
  await retryClick;
  await expect(name).toHaveValue('Retry trip');
  await expect(submit).toBeEnabled();
  await expect(page).toHaveURL('/');
});
