import { test, expect } from '@playwright/test';

const tokens = {
	idToken: 'mock-id',
	refreshToken: 'mock-refresh',
	expiresIn: 180,
};

test('home login redirects through REST, exchanges once, returns to drawer and logs out', async ({
	page,
}) => {
	let exchanges = 0;
	await page.route(/\/backend\/auth\/google(?:\?|$)/, (route) =>
		route.fulfill({
			status: 302,
			headers: {
				location: 'http://127.0.0.1:3100/auth/complete?code=mock-once',
			},
		})
	);
	await page.route('**/backend/auth/exchange', async (route) => {
		exchanges++;
		expect(route.request().postDataJSON()).toEqual({ code: 'mock-once' });
		expect(route.request().headers().authorization).toBeUndefined();
		await route.fulfill({ json: { ...tokens, returnTo: '/' } });
	});
	await page.goto('/');
	await page.getByRole('button', { name: '使用 Google 登入' }).click();
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toBeVisible();
	await expect(page).toHaveURL('http://127.0.0.1:3100/');
	expect(exchanges).toBe(1);
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '登出', exact: true }).click();
	await expect(
		page.getByRole('button', { name: '使用 Google 登入' })
	).toBeVisible();
});

test('direct callback clears URL before exchange and reload loses memory session', async ({
	page,
}) => {
	await page.route('**/backend/auth/exchange', async (route) => {
		expect(new URL(page.url()).search).toBe('');
		await route.fulfill({ json: { ...tokens, returnTo: '/' } });
	});
	await page.goto('/auth/complete?code=mock-direct');
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole('button', { name: '使用 Google 登入' })
	).toBeVisible();
});

for (const scenario of [
	{
		query: '?error=access_denied&code=ignored',
		message: '已取消或拒絕 Google 授權，可重新登入。',
	},
	{ query: '', message: '無效登入連結，請重新登入。' },
	{
		query: '?error=private-detail',
		message: '登入服務發生錯誤，請重新登入或稍後再試。(private-detail)',
	},
]) {
	test(`callback error ${scenario.query || 'missing parameters'}`, async ({
		page,
	}) => {
		let exchanges = 0;
		await page.route('**/backend/auth/exchange', (route) => {
			exchanges++;
			return route.fulfill({ json: { ...tokens, returnTo: '/' } });
		});
		await page.goto('/auth/complete' + scenario.query);
		await expect(
			page.locator('[role="alert"]:not(#__next-route-announcer__)')
		).toHaveText(scenario.message);
		await expect(page).toHaveURL('http://127.0.0.1:3100/auth/complete');
		expect(exchanges).toBe(0);
		await expect(page.getByRole('button', { name: '重新登入' })).toBeVisible();
	});
}

test('expired or consumed code is not retried', async ({ page }) => {
	let exchanges = 0;
	await page.route('**/backend/auth/exchange', (route) => {
		exchanges++;
		return route.fulfill({
			status: 400,
			json: { error: 'invalid_login_code' },
		});
	});
	await page.goto('/auth/complete?code=mock-expired');
	await expect(
		page.locator('[role="alert"]:not(#__next-route-announcer__)')
	).toHaveText('400: 登入連結已失效或已使用，請重新登入。');
	expect(exchanges).toBe(1);
});

test('automatic refresh failure offers manual recovery', async ({ page }) => {
	await page.clock.install();
	let refreshes = 0;
	await page.route('**/backend/auth/exchange', (route) =>
		route.fulfill({ json: { ...tokens, returnTo: '/' } })
	);
	await page.route('**/backend/auth/refresh', (route) => {
		refreshes++;
		expect(route.request().postDataJSON()).toEqual({
			refreshToken: 'mock-refresh',
		});
		return refreshes === 1
			? route.fulfill({ status: 504, json: { error: 'upstream_timeout' } })
			: route.fulfill({ json: { ...tokens, refreshToken: 'mock-rotated' } });
	});
	await page.goto('/auth/complete?code=mock-refresh');
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.clock.fastForward(1000);
	expect(refreshes).toBe(0);
	await page.clock.fastForward(120000);
	await expect(page.getByRole('button', { name: '重試刷新' })).toBeVisible();
	await page.evaluate(() => {
		window.dispatchEvent(new Event('focus'));
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.clock.fastForward(300000);
	expect(refreshes).toBe(1);
	await page.getByRole('button', { name: '重試刷新' }).click();
	await expect(
		page.locator('[role="alert"]:not(#__next-route-announcer__)')
	).toHaveCount(0);
	expect(refreshes).toBe(2);
});

for (const returnPath of [
	'/history',
	'//external.example',
	'https://external.example',
	'/auth/complete?code=untrusted',
	'/backend/auth/google',
	'/trip/%2e%2e/history',
	undefined,
	123,
]) {
	test(`safe return destination ${returnPath}`, async ({ page }) => {
		await page.addInitScript(() =>
			sessionStorage.setItem('auth:returnPath', '/trip/ignored-legacy-value')
		);
		await page.route('**/backend/auth/exchange', (route) =>
			route.fulfill({ json: { ...tokens, returnTo: returnPath } })
		);
		await page.goto(
			'/auth/complete?code=mock-return&returnTo=%2Ftrip%2Fignored-query-value'
		);
		await expect(page).toHaveURL(
			`http://127.0.0.1:3100${returnPath === '/history' ? '/history' : '/'}`
		);
		if (returnPath === '/history')
			await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(
			page.getByRole('button', { name: '登出', exact: true })
		).toBeVisible();
	});
}

test('network failure during exchange requires a fresh login', async ({
	page,
}) => {
	let exchanges = 0;
	await page.route('**/backend/auth/exchange', (route) => {
		exchanges++;
		return route.abort('failed');
	});
	await page.goto('/auth/complete?code=mock-network');
	await expect(
		page.locator('[role="alert"]:not(#__next-route-announcer__)')
	).toHaveText('登入服務暫時無法使用，請稍後再試。');
	await expect(page.getByRole('button', { name: '重新登入' })).toBeVisible();
	expect(exchanges).toBe(1);
});

test('refresh rejection clears login', async ({ page }) => {
	await page.clock.install();
	await page.route('**/backend/auth/exchange', (route) =>
		route.fulfill({ json: { ...tokens, returnTo: '/' } })
	);
	await page.route('**/backend/auth/refresh', (route) =>
		route.fulfill({ status: 401, json: { error: 'invalid_refresh_token' } })
	);
	await page.goto('/auth/complete?code=mock-invalid-refresh');
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toBeVisible();
	await page.clock.fastForward(120000);
	await expect(
		page.locator('[role="alert"]:not(#__next-route-announcer__)')
	).toHaveText('登入已失效，請重新登入。');
	await expect(
		page.getByRole('button', { name: '使用 Google 登入' })
	).toBeVisible();
});

test('logout during refresh cannot be undone by its late response', async ({
	page,
}) => {
	await page.clock.install();
	let release: (() => Promise<void>) | undefined;
	await page.route('**/backend/auth/exchange', (route) =>
		route.fulfill({ json: { ...tokens, returnTo: '/' } })
	);
	await page.route('**/backend/auth/refresh', (route) => {
		release = () =>
			route.fulfill({ json: { ...tokens, idToken: 'mock-late' } });
	});
	await page.goto('/auth/complete?code=mock-race');
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toBeVisible();
	await page.clock.fastForward(120000);
	await expect.poll(() => !!release).toBe(true);
	await page.getByRole('button', { name: '登出', exact: true }).click();
	await release!();
	await page.clock.fastForward(1);
	await expect(
		page.getByRole('button', { name: '使用 Google 登入' })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: '登出', exact: true })
	).toHaveCount(0);
});

for (const entryPath of [
	'/history?view=recent#saved',
	'/trip/auth-return-trip?tab=records#details',
]) {
	test(`drawer login returns to ${entryPath}`, async ({ page }) => {
		await page.route('**/query', (route) =>
			route.fulfill({
				json: {
					data: {
						trip: {
							__typename: 'Trip',
							id: 'auth-return-trip',
							name: '返回旅程測試',
							addresses: [],
							records: [],
							moneyShare: [],
							isValid: true,
						},
					},
				},
			})
		);
		let starts = 0;
		await page.route(/\/backend\/auth\/google(?:\?|$)/, (route) => {
			starts++;
			expect(route.request().isNavigationRequest()).toBe(true);
			expect(new URL(route.request().url()).searchParams.get('returnTo')).toBe(
				entryPath
			);
			return route.fulfill({
				status: 302,
				headers: {
					location:
						'http://127.0.0.1:3100/auth/complete?code=mock-drawer-return',
				},
			});
		});
		await page.route('**/backend/auth/exchange', (route) =>
			route.fulfill({ json: { ...tokens, returnTo: entryPath } })
		);
		await page.addInitScript(() => {
			Object.defineProperty(window, 'sessionStorage', {
				get() {
					throw new Error('auth must not use sessionStorage');
				},
			});
		});
		await page.goto(entryPath);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await page.getByRole('button', { name: '使用 Google 登入' }).click();
		await expect(page).toHaveURL(`http://127.0.0.1:3100${entryPath}`);
		await page.getByRole('button', { name: 'Open menu' }).click();
		await expect(
			page.getByRole('button', { name: '登出', exact: true })
		).toBeVisible();
		expect(starts).toBe(1);
	});
}
