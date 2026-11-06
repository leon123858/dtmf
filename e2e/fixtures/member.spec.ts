import { test, expect, type Page } from '@playwright/test';
const id = '550e8400-e29b-41d4-a716-446655440000';
const tokens = { idToken: 'member-token', refreshToken: 'refresh-token', expiresIn: 3600 };
async function fixture(page: Page, saved = true) {
	const calls: string[] = [];
	let trips = saved ? [{ id, name: '帳號名稱', lastViewedAt: '1000' }] : [];
	await page.route('**/backend/auth/password', route => {
		expect(route.request().postData()).toBeNull();
		return route.fulfill({ json: tokens });
	});
	await page.route('**/query', async route => {
		const body = route.request().postDataJSON();
		const operation = body.operationName;
		calls.push(operation);
		if (operation === 'CurrentUser' || /SubscribedTrip|SubscribeTrip|UnsubscribeTrip/.test(operation)) {
			expect(route.request().headers().authorization).toBe('Bearer member-token');
			if (operation !== 'CurrentUser') {
				expect(body.query).toContain('subscribedTrips');
				expect(body.query).toContain('UserFields');
			}
			const field = operation === 'CurrentUser' ? 'me' : operation[0].toLowerCase() + operation.slice(1);
			if (field === 'subscribeTrip') trips = [{ id, name: '旅程', lastViewedAt: '2000' }];
			if (field === 'unsubscribeTrip') trips = [];
			if (field === 'touchSubscribedTrip') trips = trips.map(trip => ({ ...trip, lastViewedAt: String(Date.now()) }));
			await route.fulfill({ json: { data: { [field]: { __typename: 'User', name: null, email: null, id: 'internal-user-id', subscribedTrips: trips } } } });
		} else await route.fulfill({ json: { data: { trip: { __typename: 'Trip', private: false, users: [], id, name: '旅程', addresses: [], records: [], moneyShare: [], isValid: true } } } });
	});
	return calls;
}
async function login(page: Page) {
	await page.goto('/');
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	await expect(page.getByRole('button', { name: '登出', exact: true })).toBeVisible();
}

test('member loads once per full load, merges history, touches once and preserves local history on unsubscribe', async ({ page }) => {
	const calls = await fixture(page);
	await login(page);
	await expect.poll(() => calls.filter(item => item === 'CurrentUser').length).toBe(1);
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('link', { name: '帳號名稱', exact: true }).click();
	await expect(page.getByRole('heading', { name: '旅程', exact: true })).toBeVisible();
	await expect.poll(() => calls.filter(item => item === 'TouchSubscribedTrip').length).toBe(1);
	const timestamp = await page.evaluate(() => JSON.parse(localStorage.getItem('trip_history')!)[0].timestamp);
	for (const tab of ['成員', '分帳', '帳目']) await page.getByRole('button', { name: tab, exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeChecked();
	await page.getByRole('switch', { name: '收藏此行程' }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).not.toBeChecked();
	expect(calls.filter(item => item === 'CurrentUser')).toHaveLength(1);
	expect(calls.filter(item => item === 'TouchSubscribedTrip')).toHaveLength(1);
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trip_history')!)[0].timestamp)).toBe(timestamp);
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await expect(page.getByRole('link', { name: '旅程', exact: true })).toBeVisible();
	await page.getByRole('button', { name: '收藏', exact: true }).click();
	await expect(page.getByRole('link', { name: '旅程', exact: true })).toHaveCount(0);
	await page.reload();
	await expect.poll(() => calls.filter(item => item === 'CurrentUser').length).toBe(2);
});

test('mobile drawer closes before keyboard-accessible login dialog; anonymous favorite is disabled', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await fixture(page, false);
	await page.goto(`/trip/${id}`);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeDisabled();
	await expect(page.getByText('登入後可收藏')).toBeVisible();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(1);
	await expect(page.getByRole('button', { name: '使用 Google 登入' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: '使用 GitHub 登入' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('initialization failure retries and a failed favorite leaves checkbox unchanged', async ({ page }) => {
	await fixture(page, false);
	let loads = 0;
	await page.route('**/query', async route => {
		const op = route.request().postDataJSON().operationName;
		if (op === 'CurrentUser' && ++loads === 1) return route.fulfill({ status: 503, json: { error: 'SERVICE_UNAVAILABLE' } });
		if (op === 'SubscribeTrip') return route.fulfill({ json: { errors: [{ message: 'failed' }], data: null } });
		await route.fallback();
	});
	await login(page);
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('button', { name: '重試載入收藏' }).click();
	await expect.poll(() => loads).toBe(2);
	await page.goto(`/trip/${id}`);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await page.getByRole('switch', { name: '收藏此行程' }).click();
	await expect(page.getByText('收藏同步失敗，請重試。')).toBeVisible();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).not.toBeChecked();
});

test('late member response after logout cannot restore favorites', async ({ page }) => {
	await fixture(page);
	let release: (() => Promise<void>) | undefined;
	await page.route('**/query', route => {
		if (route.request().postDataJSON().operationName !== 'CurrentUser') return route.fallback();
		release = () => route.fulfill({ json: { data: { me: { __typename: 'User', name: null, email: null, id: 'late-user', subscribedTrips: [{ id, name: '延遲收藏', lastViewedAt: '1000' }] } } } });
	});
	await login(page);
	await expect.poll(() => !!release).toBe(true);
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登出', exact: true }).click();
	await release!();
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await expect(page.getByRole('link', { name: '延遲收藏', exact: true })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem('dtmf:auth'))).toBeNull();
});

test('delayed member initialization touches the entered trip once; polling and refresh do not reload member', async ({ page }) => {
	await page.clock.install();
	const calls = await fixture(page);
	let release: (() => Promise<void>) | undefined;
	await page.route('**/query', route => {
		if (route.request().postDataJSON().operationName !== 'CurrentUser') return route.fallback();
		calls.push('CurrentUser');
		release = () => route.fulfill({ json: { data: { me: { __typename: 'User', name: null, email: null, id: 'internal-user-id', subscribedTrips: [{ id, name: '舊名稱', lastViewedAt: '1000' }] } } } });
	});
	await page.addInitScript(({ tokens }) => localStorage.setItem('dtmf:auth', JSON.stringify({ version: 1, ...tokens, expiresAt: Date.now() + 3600000 })), { tokens });
	await page.route('**/backend/auth/refresh', route => route.fulfill({ json: tokens }));
	await page.goto(`/trip/${id}`);
	await expect(page.getByRole('heading', { name: '旅程', exact: true })).toBeVisible();
	await expect.poll(() => !!release).toBe(true);
	expect(calls.filter(item => item === 'TouchSubscribedTrip')).toHaveLength(0);
	const loaded = page.waitForResponse(response => response.request().postDataJSON()?.operationName === 'CurrentUser');
	await release!();
	await loaded;
	// Apollo cache observers notify through a timer, which this test controls.
	await page.clock.runFor(100);
	await expect.poll(() => calls.filter(item => item === 'TouchSubscribedTrip').length).toBe(1);
	const timestamp = await page.evaluate(() => JSON.parse(localStorage.getItem('trip_history')!)[0].timestamp);
	await page.clock.fastForward(3600000);
	await expect.poll(() => calls.filter(item => item !== 'CurrentUser' && item !== 'TouchSubscribedTrip').length).toBeGreaterThan(1);
	expect(calls.filter(item => item === 'CurrentUser')).toHaveLength(1);
	expect(calls.filter(item => item === 'TouchSubscribedTrip')).toHaveLength(1);
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trip_history')!)[0].timestamp)).toBe(timestamp);
});

test('GitHub OAuth preserves legal return location and exposes no internal user ID', async ({ page }, testInfo) => {
	await fixture(page);
	await page.route('**/backend/auth/github?*', route => {
		expect(new URL(route.request().url()).searchParams.get('returnTo')).toBe('/history?source=saved#recent');
		return route.fulfill({ status: 302, headers: { location: '/auth/complete?code=github-once' } });
	});
	await page.route('**/backend/auth/exchange', route => route.fulfill({ json: { ...tokens, returnTo: '/history?source=saved#recent' } }));
	await page.goto('/history?source=saved#recent');
	await page.getByRole('button', { name: 'Open menu' }).click();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.screenshot({ path: testInfo.outputPath('login-dialog.png') });
	await page.getByRole('button', { name: '使用 GitHub 登入' }).click();
	await expect(page).toHaveURL('http://127.0.0.1:3100/history?source=saved#recent');
	await expect(page.getByRole('link', { name: '帳號名稱', exact: true })).toBeVisible();
	await expect(page.getByText('internal-user-id')).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('favorites-history.png') });
});

test('a new login waits for the previous query barrier and ignores its result', async ({ page }) => {
	await fixture(page);
	let release: (() => Promise<void>) | undefined;
	let loads = 0;
	await page.route('**/query', route => {
		if (route.request().postDataJSON().operationName !== 'CurrentUser' || ++loads > 1) return route.fallback();
		release = () => route.fulfill({ json: { data: { me: { __typename: 'User', name: null, email: null, id: 'previous-user', subscribedTrips: [{ id, name: '上一個帳號收藏', lastViewedAt: '1000' }] } } } });
	});
	await login(page);
	await expect.poll(() => !!release).toBe(true);
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登出', exact: true }).click();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	expect(loads).toBe(1);
	await release!();
	await expect.poll(() => loads).toBe(2);
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await expect(page.getByRole('link', { name: '帳號名稱', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: '上一個帳號收藏', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: '帳號名稱', exact: true })).toBeVisible();
});

test('a delayed favorite mutation cannot overwrite a new login', async ({ page }) => {
	await fixture(page, false);
	let release: (() => Promise<void>) | undefined;
	await page.route('**/query', route => {
		if (route.request().postDataJSON().operationName !== 'SubscribeTrip') return route.fallback();
		release = () => route.fulfill({ json: { data: { subscribeTrip: { __typename: 'User', name: null, email: null, id: 'old-user', subscribedTrips: [{ id, name: '過期收藏', lastViewedAt: '1000' }] } } } });
	});
	await login(page);
	await page.goto(`/trip/${id}`);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	const checkbox = page.getByRole('switch', { name: '收藏此行程' });
	await expect(checkbox).toBeEnabled();
	await checkbox.click();
	await expect.poll(() => !!release).toBe(true);
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登出', exact: true }).click();
	// Logout clears protected UI immediately even while the old write holds the barrier.
	await expect(page.getByRole('heading', { name: '旅程', exact: true })).toHaveCount(0);
	await release!();
	await page.getByRole('button', { name: 'Open menu' }).click();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(checkbox).toBeEnabled();
	await expect(checkbox).not.toBeChecked();
});

test('touches from consecutive trip entries serialize and retain the complete favorites list', async ({ page }) => {
	await fixture(page);
	const secondId = '550e8400-e29b-41d4-a716-446655440001';
	const trips = [{ id, name: '第一個收藏', lastViewedAt: '1000' }, { id: secondId, name: '第二個收藏', lastViewedAt: '1000' }];
	const touches: string[] = [];
	let release: (() => Promise<void>) | undefined;
	await page.route('**/query', route => {
		const { operationName, variables } = route.request().postDataJSON();
		if (operationName === 'CurrentUser') return route.fulfill({ json: { data: { me: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: trips } } } });
		if (operationName !== 'TouchSubscribedTrip') return route.fallback();
		touches.push(variables.tripId);
		const respond = () => route.fulfill({ json: { data: { touchSubscribedTrip: { __typename: 'User', name: null, email: null, id: 'user', subscribedTrips: trips } } } });
		if (touches.length === 1) { release = respond; return; }
		return respond();
	});
	await login(page);
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('link', { name: '第一個收藏', exact: true }).click();
	await expect.poll(() => touches.length).toBe(1);
	await page.getByRole('button', { name: 'Open menu' }).click();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('link', { name: '第二個收藏', exact: true }).click();
	expect(touches).toEqual([id]);
	await release!();
	await expect(page.getByRole('heading', { name: '旅程', exact: true })).toBeVisible();
	await expect.poll(() => touches).toEqual([id, secondId]);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeChecked();
	await expect(page.getByRole('switch', { name: '收藏此行程' })).toBeEnabled();
});

test('subscribe change synchronizes history without reloading CurrentUser', async ({ page }) => {
	const calls = await fixture(page, false);
	await login(page);
	await page.goto(`/trip/${id}`);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	const checkbox = page.getByRole('switch', { name: '收藏此行程' });
	await expect(checkbox).toBeEnabled();
	const loads = calls.filter(call => call === 'CurrentUser').length;
	await checkbox.click();
	await expect(checkbox).toBeChecked();
	await expect(checkbox).toBeEnabled();
	if (await page.getByRole('dialog', { name: '旅程設定', exact: true }).isVisible()) { await page.getByRole('button', { name: '關閉', exact: true }).click(); await page.getByRole('button', { name: 'Open menu' }).click(); }
	await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('button', { name: '收藏', exact: true }).click();
	await expect(page.getByRole('link', { name: '旅程', exact: true })).toBeVisible();
	expect(calls.filter(call => call === 'CurrentUser')).toHaveLength(loads);
	expect(calls.filter(call => call === 'SubscribeTrip')).toHaveLength(1);
});


test('a successful mutation for another user cannot update favorites', async ({ page }) => {
	const calls = await fixture(page, false);
	await page.route('**/query', route => route.request().postDataJSON().operationName === 'SubscribeTrip'
		? route.fulfill({ json: { data: { subscribeTrip: { __typename: 'User', name: null, email: null, id: 'another-user' } } } }) : route.fallback());
	await login(page);
	await page.goto(`/trip/${id}`);
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	const checkbox = page.getByRole('switch', { name: '收藏此行程' });
	await expect(checkbox).toBeEnabled();
	const loads = calls.filter(call => call === 'CurrentUser').length;
	await checkbox.click();
	await expect(page.getByText('收藏同步失敗，請重試。')).toBeVisible();
	await expect(checkbox).not.toBeChecked();
	expect(calls.filter(call => call === 'CurrentUser')).toHaveLength(loads);
});

test('profile navigation depends on login even when member initialization fails', async ({ page }) => {
 await fixture(page);
 await page.route('**/query', route => route.request().postDataJSON().operationName === 'CurrentUser' ? route.fulfill({ status: 503, json: {} }) : route.fallback());
 await page.goto('/');
 await expect(page.getByRole('link', { name: '個人資料', exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: '登入', exact: true }).click();
 await page.getByRole('button', { name: '測試登入', exact: true }).click();
 await expect(page.getByRole('link', { name: '個人資料', exact: true })).toBeVisible();
 await page.goto(`/trip/${id}`);
 await page.getByRole('button', { name: 'Open menu' }).click();
 const menu = page.getByRole('dialog', { name: '選單', exact: true });
 await expect(menu.locator('nav a, nav button')).toHaveText(['個人資料', '首頁', '歷史紀錄', '專案', '提案', '旅程設定']);
 await expect(menu.getByText('已登入', { exact: true })).toHaveCount(0);
 await menu.getByRole('link', { name: '個人資料', exact: true }).click();
 await expect(page).toHaveURL(/\/profile$/);
});
