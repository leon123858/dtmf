import { test, expect, type Page } from '@playwright/test';

const tripId = '550e8400-e29b-41d4-a716-446655440010';
const aliceId = '550e8400-e29b-41d4-a716-446655440011';
const bobId = '550e8400-e29b-41d4-a716-446655440012';
const tokens = { idToken: 'profile-token', refreshToken: 'profile-refresh', expiresIn: 3600 };

type BusinessFailure = { code?: string; message: string };
async function fixture(page: Page, options: { anonymous?: boolean; joined?: boolean; addressId?: string; private?: boolean; saved?: boolean; records?: boolean } = {}) {
	const state = {
		name: '小明', email: 'ming@example.test' as string | null,
		joined: options.joined ?? false, addressId: options.addressId ?? null as string | null,
		private: options.private ?? false, lastMember: true,
		failTripReads: 0, failProfileReads: 0,
		failures: {} as Record<string, BusinessFailure | undefined>,
		calls: [] as Array<{ operation: string; variables: Record<string, unknown>; query: string }>,
		addresses: [
			{ id: aliceId, nickname: '旅伴 A', useNickname: false },
			{ id: bobId, nickname: '旅伴 B', useNickname: false },
		],
	};
	if (!options.anonymous) await page.addInitScript(({ tokens }) => {
		localStorage.setItem('dtmf:auth', JSON.stringify({ version: 1, ...tokens, expiresAt: Date.now() + 3600000 }));
	}, { tokens });
	await page.route('**/backend/auth/refresh', route => route.fulfill({ json: tokens }));
	await page.route('**/backend/auth/password', route => route.fulfill({ json: tokens }));
	const address = (item: typeof state.addresses[number]) => ({
		__typename: 'Address', id: item.id,
		name: state.addressId === item.id && !item.useNickname ? state.name || item.nickname : item.nickname,
		useNickname: item.useNickname,
		bind: state.joined && state.addressId === item.id ? { __typename: 'BoundUser', userId: 'profile-user', userName: state.name } : null,
		statistics: { __typename: 'AddressStatistics', totalExpense: 0, totalPrepaid: 0, activeRecordCount: 0 },
	});
	await page.route('**/query', async route => {
		const { operationName: operation, variables = {}, query } = route.request().postDataJSON();
		state.calls.push({ operation, variables, query });
		const fail = (failure: BusinessFailure) => route.fulfill({ json: { data: null, errors: [{ message: failure.message, ...(failure.code ? { extensions: { code: failure.code } } : {}) }] } });
		const failure = state.failures[operation];
		if (failure) return fail(failure);
		const result = (field: string, value: unknown) => route.fulfill({ json: { data: { [field]: value } } });
		const user = { __typename: 'User', id: 'profile-user', name: state.name, email: state.email,
			subscribedTrips: options.saved ? [{ __typename: 'SubscribedTrip', id: tripId, name: '身分測試旅程', lastViewedAt: '1000' }] : [] };
		if (operation === 'CurrentUser') {
			if (state.failProfileReads-- > 0) return fail({ message: 'profile offline' });
			return result('me', user);
		}
		if (operation === 'GetTrip') {
			if (state.private && !route.request().headers().authorization) return fail({ code: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' });
			if (state.private && !state.joined) return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
			if (state.failTripReads-- > 0) return fail({ message: 'trip offline' });
			return result('trip', { __typename: 'Trip', id: tripId, name: '身分測試旅程', private: state.private,
				users: state.joined ? [{ __typename: 'BoundUser', userId: user.id, userName: state.name }] : [],
				addresses: state.addresses.map(address), records: options.records ? [{
					__typename: 'Record', id: '550e8400-e29b-41d4-a716-446655440014', name: '測試帳目', amount: 0,
					prePayAddress: address(state.addresses[0]), shouldPayAddress: [address(state.addresses[0])],
					extendPayMsg: [], category: 'NORMAL', time: '1793145600000', isValid: true, isActive: true, isDeleted: false, parentRecordId: null,
				}] : [], moneyShare: [], isValid: true });
		}
		if (operation === 'UpdateProfile') { state.name = variables.input.name; return result('updateMe', user && { ...user, name: state.name }); }
		if (operation === 'BindTrip') {
			if (state.private && !state.joined) return fail({ code: 'FORBIDDEN', message: 'FORBIDDEN' });
			state.joined = true; state.addressId = variables.addressId ?? null;
			return result('bind', user);
		}
		if (operation === 'UnbindTrip') {
			if (state.private && state.lastMember) return fail({ code: 'CONFLICT', message: 'CONFLICT' });
			state.joined = false; state.addressId = null;
			return result('unbind', user);
		}
		if (operation === 'CreateAddress') {
			let item = state.addresses.find(item => variables.bindToMe && item.id === state.addressId);
			if (!item) {
				item = { id: '550e8400-e29b-41d4-a716-446655440013', nickname: variables.input.name ?? state.name, useNickname: variables.input.useNickname ?? false };
				state.addresses.push(item);
				if (variables.bindToMe) { state.joined = true; state.addressId = item.id; }
			}
			return result('createAddress', { ...address(item), __typename: 'AddressSnapshot' });
		}
		if (operation === 'UpdateAddress') {
			const item = state.addresses.find(item => item.id === variables.addressId)!;
			if (variables.input.name !== undefined) item.nickname = variables.input.name;
			if (variables.input.useNickname !== undefined) item.useNickname = variables.input.useNickname;
			return result('updateAddress', { ...address(item), __typename: 'AddressSnapshot' });
		}
		if (operation === 'UpdateTrip') { state.private = variables.input.private; return result('updateTrip', { __typename: 'TripSnapshot', id: tripId, name: '身分測試旅程', private: state.private }); }
		if (operation === 'TouchSubscribedTrip') return result('touchSubscribedTrip', user);
		throw new Error(`Unexpected operation ${operation}`);
	});
	return state;
}
async function members(page: Page) {
	await page.goto(`/trip/${tripId}`);
	await page.getByRole('button', { name: '成員', exact: true }).click();
}
async function settings(page: Page) {
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	return page.getByRole('dialog', { name: '旅程設定' });
}
const operations = (state: Awaited<ReturnType<typeof fixture>>, operation: string) => state.calls.filter(call => call.operation === operation);

test('profile edits name, retains read-only email and never exposes mail subscription', async ({ page }, testInfo) => {
	const state = await fixture(page);
	await page.goto('/profile');
	await expect(page.getByLabel('個人名稱')).toHaveValue('小明');
	await expect(page.getByText('ming@example.test')).toBeVisible();
	await expect(page.getByRole('checkbox')).toHaveCount(0);
	await expect(page.getByRole('textbox')).toHaveCount(1);
	await page.getByLabel('個人名稱').fill('  新名字 🐰  ');
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('個人資料已儲存。')).toBeVisible();
	expect(operations(state, 'UpdateProfile')[0].variables).toEqual({ input: { name: '  新名字 🐰  ' } });
	expect(operations(state, 'CurrentUser')).toHaveLength(2);
	expect(state.calls.some(call => call.query.includes('subMail'))).toBe(false);
	await page.screenshot({ path: testInfo.outputPath('profile-desktop.png'), fullPage: true });
	await testInfo.attach('profile-desktop', { path: testInfo.outputPath('profile-desktop.png'), contentType: 'image/png' });
});

test('profile validates Unicode names and retries only the read after successful save', async ({ page }) => {
	const state = await fixture(page);
	await page.goto('/profile');
	const input = page.getByLabel('個人名稱');
	await input.fill('   ');
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.locator('form').getByRole('alert')).toContainText('不可為空白');
	await input.fill('🐰'.repeat(101));
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.locator('form').getByRole('alert')).toContainText('最多 100');
	expect(operations(state, 'UpdateProfile')).toHaveLength(0);
	await input.fill('🐰'.repeat(100));
	state.failProfileReads = 1;
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.locator('form').getByRole('alert')).toContainText('已儲存，資料更新失敗');
	await expect(page.getByRole('button', { name: '儲存', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: '重試更新資料' }).click();
	await expect(page.getByText('個人資料已儲存。')).toBeVisible();
	expect(operations(state, 'UpdateProfile')).toHaveLength(1);
});

for (const mode of ['existing', 'new', 'none']) test(`join using ${mode} without modifying favorites`, async ({ page }) => {
	const state = await fixture(page);
	await members(page);
	await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toBeEnabled();
	const reads = operations(state, 'GetTrip').length;
	await page.getByRole('button', { name: '加入旅程', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: '設定我的旅程身分' });
	if (mode === 'existing') await dialog.getByLabel('分帳成員', { exact: true }).selectOption(aliceId);
	if (mode === 'new') await dialog.getByRole('radio', { name: '新增自己的分帳成員' }).check();
	if (mode === 'none') await dialog.getByRole('radio', { name: '只加入旅程，暫不對應分帳成員' }).check();
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.getByRole('region', { name: '我的旅程身分' })).toContainText(mode === 'none' ? '已加入，尚未設定分帳身分' : '我的分帳身分：小明');
	expect(state.joined).toBe(true);
	if (mode === 'new') expect(operations(state, 'CreateAddress')[0].variables).toMatchObject({ bindToMe: true, input: {} });
	else expect(operations(state, 'BindTrip')[0].variables).toMatchObject(mode === 'existing' ? { tripId, addressId: aliceId } : { tripId });
	expect(operations(state, 'GetTrip')).toHaveLength(reads + 1);
	expect(operations(state, 'CurrentBinding')).toHaveLength(0);
	await expect.poll(() => operations(state, 'CurrentUser').length).toBe(2);
	expect(state.calls.filter(call => /SubscribeTrip|UnsubscribeTrip|TouchSubscribedTrip/.test(call.operation))).toHaveLength(0);
});

test('binding conflicts preserve the dialog; clearing assignment preserves membership and leaving preserves favorite', async ({ page }) => {
	const state = await fixture(page, { saved: true });
	await members(page);
	await page.getByRole('button', { name: '加入旅程', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: '設定我的旅程身分' });
	await dialog.getByLabel('分帳成員', { exact: true }).selectOption(aliceId);
	state.failures.BindTrip = { code: 'CONFLICT', message: 'CONFLICT' };
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('已被綁定');
	await expect(dialog).toBeVisible();
	delete state.failures.BindTrip;
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(page.getByText('我的分帳身分：小明', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: '設定分帳身分' }).click();
	await dialog.getByLabel('分帳成員', { exact: true }).selectOption(bobId);
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	expect(state.addressId).toBe(bobId);
	await page.getByRole('button', { name: '設定分帳身分' }).click();
	await dialog.getByRole('radio', { name: '取消分帳身分，保留加入資格' }).check();
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(page.getByText('已加入，尚未設定分帳身分')).toBeVisible();
	expect(state.joined).toBe(true);
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toBeVisible();
	expect(operations(state, 'UnsubscribeTrip')).toHaveLength(0);
	expect(operations(state, 'TouchSubscribedTrip')).toHaveLength(1);
});

test('address editor fits a keyboard viewport and restores focus on cancellation', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await fixture(page, { joined: true, addressId: aliceId });
 await members(page);
 const trigger = page.getByRole('button', { name: '名稱設定', exact: true }).first();
 await trigger.click();
 const dialog = page.getByRole('dialog', { name: '名稱設定', exact: true });
 await expect(page.getByLabel('設定新旅程暱稱')).toBeFocused();
 await page.evaluate(() => {
  Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 360 });
  Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, value: 40 });
  window.visualViewport!.dispatchEvent(new Event('resize'));
  window.visualViewport!.dispatchEvent(new Event('scroll'));
 });
 await expect.poll(async () => {
  const box = (await dialog.boundingBox())!;
  return box.y >= 40 && box.y + box.height <= 400;
 }).toBe(true);
 await dialog.getByRole('button', { name: '取消', exact: true }).click();
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
 await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('nickname settings leave raw nickname untouched when only the switch changes', async ({ page }) => {
	const state = await fixture(page, { joined: true, addressId: aliceId });
	await members(page);
	await page.getByRole('button', { name: '名稱設定', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: '名稱設定', exact: true })).toBeVisible();
	await expect(page.getByLabel('設定新旅程暱稱')).toBeFocused();
	await expect(page.getByLabel('設定新旅程暱稱')).toHaveValue('');
	await page.getByLabel('固定使用旅程暱稱').check();
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('我的分帳身分：旅伴 A')).toBeVisible();
	expect(operations(state, 'UpdateAddress')[0].variables).toEqual({ tripId, addressId: aliceId, input: { useNickname: true } });
	expect(state.addresses[0].nickname).toBe('旅伴 A');
	await page.getByRole('button', { name: '名稱設定', exact: true }).first().click();
	await page.getByLabel('設定新旅程暱稱').fill('旅行用暱稱');
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('我的分帳身分：旅行用暱稱')).toBeVisible();
});

test('successful binding with a failed follow-up query retries only reads', async ({ page }) => {
	const state = await fixture(page);
	await members(page);
	await page.getByRole('button', { name: '加入旅程', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: '設定我的旅程身分' });
	await dialog.getByRole('radio', { name: '只加入旅程，暫不對應分帳成員' }).check();
	state.failTripReads = 1;
	await dialog.getByRole('button', { name: '確認', exact: true }).click();
	await expect(page.getByText('已儲存，資料更新失敗，請重試。')).toBeVisible();
	await page.getByRole('button', { name: '重試更新資料' }).click();
	await expect(page.getByText('已儲存，資料更新失敗，請重試。')).toHaveCount(0);
	expect(operations(state, 'BindTrip')).toHaveLength(1);
});

test('privacy requires joined membership and explicit confirmation; last member cannot leave private trip', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const state = await fixture(page, { joined: true, addressId: aliceId });
	await members(page);
	const dialog = await settings(page);
	await dialog.getByRole('switch', { name: '私有旅程', exact: true }).click();
	await expect(page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true })).toContainText('目前無邀請功能');
	expect(operations(state, 'UpdateTrip')).toHaveLength(0);
	await page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true }).getByRole('button', { name: '確認切換' }).click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: '關閉', exact: true }).click();
	await expect(page.getByText('私有', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect(page.getByRole('dialog', { name: '離開旅程？' }).getByRole('alert')).toContainText('最後一名成員');
	await page.getByRole('button', { name: '前往隱私設定' }).click();
	await expect(dialog).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('privacy-mobile.png'), fullPage: true });
	await testInfo.attach('privacy-mobile', { path: testInfo.outputPath('privacy-mobile.png'), contentType: 'image/png' });
	await dialog.getByRole('switch', { name: '私有旅程', exact: true }).click();
	await page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true }).getByRole('button', { name: '確認切換' }).click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: '關閉', exact: true }).click();
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toBeVisible();
	expect(operations(state, 'UpdateTrip').map(call => call.variables.input)).toEqual([{ private: true }, { private: false }]);
});

test('public visitors can edit without joining; privacy settings do not silently join', async ({ page }) => {
	const state = await fixture(page);
	await members(page);
	const dialog = await settings(page);
	await expect(dialog).toContainText('需先加入旅程');
	await expect(dialog.getByRole('switch', { name: '私有旅程', exact: true })).toBeDisabled();
	expect(operations(state, 'BindTrip')).toHaveLength(0);
	await dialog.getByRole('button', { name: '關閉', exact: true }).click();
	await page.getByRole('button', { name: '名稱設定' }).first().click();
	await page.getByLabel('設定新旅程暱稱').fill('公開編輯');
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('公開編輯', { exact: true })).toBeVisible();
});

test('private anonymous access asks for login; authenticated outsider sees forbidden', async ({ page }) => {
	await fixture(page, { anonymous: true, private: true });
	await page.goto(`/trip/${tripId}`);
	await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: '記帳', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: '登入', exact: true }).click();
	await page.getByRole('button', { name: '測試登入', exact: true }).click();
	await expect(page.getByText('你沒有此旅程的存取或操作權限。')).toBeVisible();
});

test('revoked polling access removes cached content and suspends background requests until retry', async ({ page }) => {
	await page.clock.install();
	const state = await fixture(page, { joined: true });
	await members(page);
	state.failures.GetTrip = { code: 'FORBIDDEN', message: 'FORBIDDEN' };
	await page.clock.fastForward(40_000);
	await expect(page.getByText('你沒有此旅程的存取或操作權限。')).toBeVisible();
	await expect(page.getByRole('button', { name: '記帳', exact: true })).toHaveCount(0);
	const reads = operations(state, 'GetTrip').length;
	await page.clock.fastForward(120_000);
	expect(operations(state, 'GetTrip')).toHaveLength(reads);
	delete state.failures.GetTrip;
	await page.getByRole('button', { name: '重試', exact: true }).click();
	await expect(page.getByRole('heading', { name: '身分測試旅程', exact: true })).toBeVisible();
});

test('trip read failure keeps binding unknown and supports retry', async ({ page }) => {
	const state = await fixture(page, { joined: true });
	state.failures.GetTrip = { message: 'trip offline' };
	await page.goto(`/trip/${tripId}`);
	await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: '重試', exact: true })).toBeVisible();
	delete state.failures.GetTrip;
	await page.getByRole('button', { name: '重試', exact: true }).click();
	await page.getByRole('button', { name: '成員', exact: true }).click();
	await expect(page.getByText('已加入，尚未設定分帳身分')).toBeVisible();
});

test('profile name changes refresh bound names and historical records on returning through client navigation', async ({ page }) => {
	const state = await fixture(page, { joined: true, addressId: aliceId, saved: true, records: true });
	await members(page);
	await expect(page.getByText('我的分帳身分：小明', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await page.getByRole('switch', { name: '顯示紀錄歷史', exact: true }).check();
	await page.getByRole('button', { name: '關閉', exact: true }).click();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '個人資料', exact: true }).click();
	await page.getByLabel('個人名稱').fill('新的個人名稱');
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('個人資料已儲存。')).toBeVisible();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '歷史紀錄', exact: true }).click();
	await page.getByRole('button', { name: '身分測試旅程', exact: true }).click();
	await page.getByRole('button', { name: '成員', exact: true }).click();
	await expect(page.getByText('我的分帳身分：新的個人名稱', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await page.getByRole('switch', { name: '顯示紀錄歷史', exact: true }).check();
	await page.getByRole('button', { name: '關閉', exact: true }).click();
	await page.getByRole('button', { name: '帳目', exact: true }).click();
	await page.getByRole('button', { name: '查看 測試帳目', exact: true }).click();
	await expect(page.getByRole('dialog', { name: '帳目詳情' })).toContainText('新的個人名稱');
	expect(operations(state, 'UpdateProfile')).toHaveLength(1);
	expect(operations(state, 'TouchSubscribedTrip')).toHaveLength(2);
});

for (const operation of ['UpdateAddress', 'SubscribeTrip']) test(`access rejected by ${operation} immediately hides trip data and stops polling`, async ({ page }) => {
	await page.clock.install();
	const state = await fixture(page, { joined: true, addressId: aliceId, private: true });
	await members(page);
	state.failures[operation] = { code: 'FORBIDDEN', message: 'FORBIDDEN' };
	if (operation === 'UpdateAddress') {
		await page.getByRole('button', { name: '名稱設定', exact: true }).first().click();
		await page.getByLabel('設定新旅程暱稱').fill('權限測試');
		await page.getByRole('button', { name: '儲存', exact: true }).click();
	} else {
		await page.getByRole('button', { name: 'Open menu' }).click();
		await page.getByRole('button', { name: '旅程設定', exact: true }).click();
		await page.getByRole('switch', { name: '收藏此行程' }).click();
	}
	await expect(page.getByText('你沒有此旅程的存取或操作權限。')).toBeVisible();
	await expect(page.getByRole('heading', { name: '身分測試旅程', exact: true })).toHaveCount(0);
	const queries = operations(state, 'GetTrip').length;
	await page.clock.fastForward(100_000);
	expect(operations(state, 'GetTrip')).toHaveLength(queries);
});

test('nickname errors retain the draft; after a successful write only reads are retried', async ({ page }) => {
	const state = await fixture(page, { joined: true, addressId: aliceId });
	await members(page);
	await page.getByRole('button', { name: '名稱設定', exact: true }).first().click();
	await page.getByLabel('設定新旅程暱稱').fill('保留這個暱稱');
	state.failures.UpdateAddress = { code: 'CONFLICT', message: 'CONFLICT' };
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByRole('region', { name: '成員列表' }).getByRole('alert')).toContainText('暱稱已存在');
	await expect(page.getByLabel('設定新旅程暱稱')).toHaveValue('保留這個暱稱');
	delete state.failures.UpdateAddress;
	state.failTripReads = 1;
	await page.getByRole('button', { name: '儲存', exact: true }).click();
	await expect(page.getByText('已儲存，資料更新失敗，請重試。')).toBeVisible();
	await page.getByRole('button', { name: '重試更新資料' }).click();
	await expect(page.getByText('已儲存，資料更新失敗，請重試。')).toHaveCount(0);
	expect(operations(state, 'UpdateAddress')).toHaveLength(2);
});

test('privacy save followed by a failed query retries only reads', async ({ page }) => {
	const state = await fixture(page, { joined: true });
	await members(page);
	const dialog = await settings(page);
	await dialog.getByRole('switch', { name: '私有旅程', exact: true }).click();
	state.failTripReads = 1;
	await page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true }).getByRole('button', { name: '確認切換' }).click();
	await expect(dialog.getByRole('alert')).toContainText('已儲存，資料更新失敗');
	await dialog.getByRole('button', { name: '重試更新資料' }).click();
	await expect(dialog).toBeVisible();
	expect(operations(state, 'UpdateTrip')).toHaveLength(1);
});

test('successful private departure clears both modes and stops polling when follow-up read fails', async ({ page }) => {
	await page.clock.install();
	const state = await fixture(page, { joined: true, addressId: aliceId, private: true, saved: true, records: true });
	state.lastMember = false;
	await members(page);
	// Populate both query variants before leaving.
	await page.getByRole('button', { name: 'Open menu' }).click();
	await page.getByRole('button', { name: '旅程設定', exact: true }).click();
	await page.getByRole('switch', { name: '顯示紀錄歷史', exact: true }).check();
	await page.getByRole('button', { name: '關閉', exact: true }).click();
	await expect(page.getByText('我的分帳身分：小明', { exact: true })).toBeVisible();
	state.failures.GetTrip = { message: 'trip offline after departure' };
	await page.getByRole('button', { name: '離開旅程', exact: true }).click();
	await page.getByRole('button', { name: '確認離開', exact: true }).click();
	await expect.poll(() => operations(state, 'UnbindTrip').length).toBe(1);
	await expect(page.getByRole('button', { name: '重試', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: '身分測試旅程', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: '記帳', exact: true })).toHaveCount(0);
	const reads = operations(state, 'GetTrip').length;
	await page.clock.fastForward(120_000);
	expect(operations(state, 'GetTrip')).toHaveLength(reads);
	// Foreground retry can recover after the backend grants access again.
	delete state.failures.GetTrip;
	state.joined = true;
	await page.getByRole('button', { name: '重試', exact: true }).click();
	await expect(page.getByRole('heading', { name: '身分測試旅程', exact: true })).toBeVisible();
	expect(operations(state, 'UnbindTrip')).toHaveLength(1);
	const recovered = operations(state, 'GetTrip').length;
	await page.clock.fastForward(40_000);
	await expect.poll(() => operations(state, 'GetTrip').length).toBeGreaterThan(recovered);
	expect(state.calls.filter(call => /^(SubscribeTrip|UnsubscribeTrip)$/.test(call.operation))).toHaveLength(0);
});

for (const width of [390, 1280]) test(`settings center, keyboard, cancellation and saved state at ${width}px`, async ({ page }, testInfo) => {
 await page.setViewportSize({ width, height: 844 });
 const state = await fixture(page, { joined: true });
 await members(page);
 const reads = operations(state, 'GetTrip').length;
 const dialog = await settings(page);
 await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`) });
 const box = await dialog.boundingBox();
 expect(box).not.toBeNull();
 expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
 expect(box!.x).toBeGreaterThanOrEqual(15);
 const privacy = dialog.getByRole('switch', { name: '私有旅程', exact: true });
 await privacy.focus();
 await page.keyboard.press('Space');
 const confirmation = page.getByRole('dialog', { name: '確認切換旅程隱私', exact: true });
 await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
 await expect(dialog.locator('#trip-private')).not.toBeChecked();
 await page.keyboard.press('Escape');
 await expect(privacy).toBeFocused();
 await expect(privacy).not.toBeChecked();
 expect(operations(state, 'UpdateTrip')).toHaveLength(0);
 expect(operations(state, 'GetTrip')).toHaveLength(reads);
 await privacy.click();
 await confirmation.getByRole('button', { name: '確認切換' }).click();
 await expect(confirmation).not.toBeVisible();
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('status')).toContainText('隱私設定已儲存');
 await expect(privacy).toBeChecked();
 expect(operations(state, 'UpdateTrip')).toHaveLength(1);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
});
