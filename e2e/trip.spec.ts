import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('旅程主要功能：成員、帳目、分帳、還款、分享與歷史', async ({ page, context }) => {
  const tripName = `E2E-${randomUUID().slice(0, 8)}`;
  const repayment = 'Bob payback to Alice';
  let tripUrl = '';
  const form = page.locator('form');

  await test.step('建立旅程', async () => {
    await page.goto('/');
    await page.getByPlaceholder('例如: 2024 日本關西之旅').fill(tripName);
    await page.getByRole('button', { name: '開始分帳' }).click();
    await expect(page).toHaveURL(/\/trip\/[^/]+$/);
    await expect(page.getByRole('heading', { name: tripName, exact: true })).toBeVisible();
    tripUrl = page.url();
  });

  await test.step('成員新增、改名、移除', async () => {
    await page.getByRole('button', { name: '成員', exact: true }).click();
    for (const name of ['Alice', 'Bob', 'Guest']) {
      await page.getByRole('button', { name: '新增成員' }).click();
      await page.getByPlaceholder('輸入新成員名稱').fill(name);
      await page.getByRole('main').getByRole('button', { name: '新增', exact: true }).click();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    const guest = page.locator('div').filter({ has: page.getByText('Guest', { exact: true }) })
      .filter({ has: page.getByRole('button', { name: '改名', exact: true }) }).last();
    await guest.getByRole('button', { name: '改名' }).click();
    await page.getByRole('textbox', { name: '修改 Guest 的名稱' }).fill('Visitor');
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    const visitor = page.getByText('Visitor', { exact: true });
    await expect(visitor).toBeVisible();
    await visitor.locator('..').getByRole('button', { name: '移除' }).click();
    await expect(visitor).toHaveCount(0);
  });

  async function expectDebt(amount: string) {
    await page.getByRole('button', { name: '分帳結果', exact: true }).click();
    await expect(page.getByRole('button', { name: 'payback', exact: true })).toHaveCount(1);
    const payer = page.getByText('Bob', { exact: true }).locator('..');
    await expect(payer).toContainText(`$${amount}`);
    const receiver = page.getByText('Alice', { exact: true }).locator('..');
    await expect(receiver).toContainText('收到');
    await expect(receiver).toContainText(`$${amount}`);
  }

  await test.step('新增均分帳目', async () => {
    await page.getByRole('button', { name: '帳目', exact: true }).click();
    await page.getByRole('button', { name: '新增', exact: true }).click();
    await form.getByLabel('項目名稱', { exact: true }).fill('Lunch');
    await form.getByLabel('金額', { exact: true }).fill('300');
    await form.getByLabel('預付人').selectOption({ label: 'Alice' });
    await form.getByRole('checkbox', { name: 'Alice', exact: true }).check();
    await form.getByRole('checkbox', { name: 'Bob', exact: true }).check();
    await form.getByLabel('分攤方式').selectOption({ label: '均分' });
    await form.getByRole('button', { name: '新增', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('Lunch', { exact: true })).toBeVisible();
    await expectDebt('150.00');
  });

  await test.step('編輯帳目與結算', async () => {
    await page.getByRole('button', { name: '帳目', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Lunch', exact: true }).click();
    await form.getByLabel('項目名稱', { exact: true }).fill('Dinner');
    await form.getByLabel('金額', { exact: true }).fill('400');
    await form.getByRole('button', { name: '儲存變更' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('Dinner', { exact: true })).toBeVisible();
    await expect(page.getByText('Lunch', { exact: true })).toHaveCount(0);
    await expectDebt('200.00');
  });

  await test.step('還款與刪除還款', async () => {
    await page.getByRole('button', { name: 'payback', exact: true }).click();
    await expect(form.getByLabel('項目名稱', { exact: true })).toHaveValue(repayment);
    await form.getByRole('button', { name: '新增', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('帳目計算中，或沒有需要分帳的項目。')).toBeVisible();
    await page.getByRole('button', { name: '帳目', exact: true }).click();
    await expect(page.getByText(repayment, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Delete ${repayment}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(repayment, { exact: true })).toHaveCount(0);
    await expectDebt('200.00');
  });

  await test.step('帳目版本歷史', async () => {
    await page.getByRole('button', { name: '帳目', exact: true }).click();
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('switch', { name: 'Record history', exact: true }).check();
    await page.getByRole('button', { name: 'Close menu', exact: true }).click();
    await expect(page.getByText(/\[Old Version.*Lunch/)).toBeVisible();
    await expect(page.getByText(/\[Deleted.*Bob payback to Alice/)).toBeVisible();
  });

  await test.step('分享與瀏覽歷史、重新整理', async () => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3100' });
    await page.getByRole('button', { name: '🔗 分享', exact: true }).click();
    await expect(page.getByRole('button', { name: '已複製！', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(tripUrl);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: '瀏覽歷史', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await page.getByRole('button', { name: tripName, exact: true }).click();
    await expect(page).toHaveURL(tripUrl);
    await page.reload();
    await expect(page.getByRole('heading', { name: tripName, exact: true })).toBeVisible();
    await expect(page.getByText('Dinner', { exact: true })).toBeVisible();
    await expectDebt('200.00');
  });
});
