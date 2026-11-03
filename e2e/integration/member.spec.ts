import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
test('real member login, automatic favorite on creation, reload and logout', async ({ page }) => {
	test.skip(process.env.E2E_MEMBER_ENABLED !== '1', 'Real member tests require E2E_MEMBER_ENABLED=1 and complete backend GCIP/account configuration.');
	await page.goto('/');
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	await expect(page.getByRole('button', { name: '登出', exact: true })).toBeVisible();
	let subscribeAttempts = 0;
	let createActions = 0;
	page.on('request', request => { if (request.headers()['next-action']) createActions++; });
	await page.route('**/query', route => {
		if (route.request().postDataJSON().operationName === 'SubscribeTrip') subscribeAttempts++;
		return route.continue();
	});
	const name = `Member-${randomUUID().slice(0, 8)}`;
	await page.getByPlaceholder('例如: 2024 日本關西之旅').fill(name);
	await page.getByRole('button', { name: '開始分帳' }).click();
	await expect(page).toHaveURL(/\/trip\//);
	expect(createActions).toBe(1);
	expect(subscribeAttempts).toBe(0);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeChecked();
	expect(subscribeAttempts).toBe(0);
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '歷史紀錄', exact: true }).click();
	await expect(page).toHaveURL(/\/history$/);
	await page.reload();
	await page.getByRole('button', { name: '收藏', exact: true }).click();
	await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
	await page.getByRole('button', { name, exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await page.getByRole('switch', { name: '收藏此行程' }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).not.toBeChecked();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登出', exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeDisabled();
});

test('real member binding, nickname and privacy lifecycle', async ({ page, context }) => {
	test.skip(process.env.E2E_MEMBER_ENABLED !== '1', 'Real member tests require E2E_MEMBER_ENABLED=1 and complete backend GCIP/account configuration.');
	await page.goto('/');
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	await expect(page.getByRole('button', { name: '登出', exact: true })).toBeVisible();
	const name = `Privacy-${randomUUID().slice(0, 8)}`;
	await page.getByPlaceholder('例如: 2024 日本關西之旅').fill(name);
	await page.getByRole('button', { name: '開始分帳' }).click();
	await expect(page).toHaveURL(/\/trip\//);
	const tripUrl = page.url();
	await page.getByRole('button', { name: '成員', exact: true }).click();
	await page.getByRole('button', { name: '加入旅程', exact: true }).click();
	const identity = page.getByRole('dialog', { name: '設定我的旅程身分' });
	await identity.getByRole('radio', { name: '新增自己的分帳成員' }).check();
	await identity.getByLabel('新成員暱稱').fill(`Self-${name}`);
	await identity.getByRole('button', { name: '確認', exact: true }).click();
	await expect(identity).not.toBeVisible();
	await expect(page.getByRole('region', { name: '我的旅程身分' })).toContainText('我的分帳身分：');
	await page.getByRole('button', { name: '名稱設定', exact: true }).click();
	await expect(page.getByLabel('設定新旅程暱稱')).toHaveValue('');
	await page.getByLabel('固定使用旅程暱稱').check();
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText(`我的分帳身分：Self-${name}`, { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeChecked();
	const settings = page.getByRole('dialog', { name: '旅程設定' });
	await settings.getByRole('switch', { name: '私有旅程', exact: true }).click();
	await page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true }).getByRole('button', { name: '確認切換' }).click();
	await expect(settings).toBeVisible();
	await settings.getByRole('button', { name: '關閉', exact: true }).click();
	await expect(page.getByText('私有', { exact: true })).toBeVisible();
	const anonymous = await context.browser()!.newContext();
	try {
		const outsider = await anonymous.newPage();
		await outsider.goto(tripUrl);
		await expect(outsider.getByRole('button', { name: '登入', exact: true })).toBeVisible();
		await expect(outsider.getByRole('button', { name: '記帳', exact: true })).toHaveCount(0);
	} finally { await anonymous.close(); }
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect(page.getByRole('dialog', { name: '離開旅程？' }).getByRole('alert')).toContainText('最後一名成員');
	await page.getByRole('button', { name: '前往隱私設定' }).click();
	await settings.getByRole('switch', { name: '私有旅程', exact: true }).click();
	await page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true }).getByRole('button', { name: '確認切換' }).click();
	await expect(settings).toBeVisible();
	await settings.getByRole('button', { name: '關閉', exact: true }).click();
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeChecked();
	await page.getByRole('switch', { name: '收藏此行程' }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).not.toBeChecked();
});
