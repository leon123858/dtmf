import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { RecordCategory, type Record } from '../../src/app/lib/tripApi/types';

test.use({ locale: 'en-US', timezoneId: 'Asia/Taipei' });

const chinese = '這是一筆很長很長的帳目名稱，包含飯店住宿交通餐飲以及所有人的共同開銷。'.repeat(6);
const english = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(15);
const addresses = [
	{ id: 'a', name: '非常非常長的付款人成員名稱'.repeat(5) },
	{ id: 'b', name: 'AnotherParticipant'.repeat(8) },
];

function makeRecords(count: number): Record[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `r${i}`, name: ['Lunch', chinese, english, '🍜🧑🏽‍🍳✈️'.repeat(60)][i % 4],
		amount: i % 3 ? 1234567890123.45 : 300,
		prePayAddress: addresses[0], shouldPayAddress: addresses, extendPayMsg: [],
		category: RecordCategory.NORMAL, time: String(1789056000000 + i * 60000),
		isValid: true, isDeleted: false, isActive: true, parentRecordId: null,
	}));
}

async function mockTrip(page: Page, initial: Record[], tripName = 'Layout probe') {
	const state = { records: initial, mutationCount: 0, failDelete: false, failQuery: false, delayDelete: 0, versionEdits: false };
	await page.route('**/query', async route => {
		const body = route.request().postDataJSON();
		if (body.operationName === 'UpdateRecord') {
			state.mutationCount++;
			if (state.delayDelete) await new Promise(resolve => setTimeout(resolve, state.delayDelete));
			if (state.failDelete) return route.fulfill({ json: { errors: [{ message: 'Deletion unavailable' }] } });
			const record = state.records.find(record => record.id === body.variables.recordId)!;
			const input = body.variables.input.new;
			const updated = { ...record, name: input.name, amount: input.amount, isDeleted: input.isDeleted,
				prePayAddress: addresses.find(address => address.id === input.prePayAddressId) ?? record.prePayAddress,
				shouldPayAddress: record.shouldPayAddress.filter(address => input.shouldPayAddressIds.includes(address.id)) };
			if (state.versionEdits && !input.isDeleted) {
				updated.id = `${record.id}-edited`;
				updated.parentRecordId = record.id;
				state.records = [...state.records.map(item => item.id === record.id ? { ...item, isActive: false } : item), updated];
			} else state.records = state.records.map(item => item.id === record.id ? updated : item);
			return route.fulfill({ json: { data: { updateRecord: updated } } });
		}
		if (state.failQuery) return route.fulfill({ status: 503, json: { errors: [{ message: 'Offline' }] } });
		return route.fulfill({ json: { data: { trip: {
			id: 'layout-probe', name: tripName, addresses, moneyShare: [], isValid: true,
			records: body.variables.haveHistory ? state.records : state.records.filter(record => record.isActive && !record.isDeleted),
		} } } });
	});
	await page.goto('/trip/layout-probe');
 // Next's development issue badge can cover bottom navigation after intentional API errors.
 await page.addStyleTag({ content: 'nextjs-portal { visibility: hidden; }' });
	await expect(page.getByRole('region', { name: '帳目列表' })).toBeVisible();
	return state;
}

async function history(page: Page) {
	await page.getByRole('button', { name: 'Open menu', exact: true }).click();
	await page.getByRole('switch', { name: 'Record history', exact: true }).click();
	await page.getByRole('button', { name: 'Close menu', exact: true }).click();
}

async function measurements(page: Page) {
	return page.getByRole('region', { name: '帳目列表' }).evaluate(scroller => {
		const rows = Array.from(scroller.querySelectorAll<HTMLElement>('[data-index]'));
		return {
			viewport: { width: innerWidth, height: innerHeight },
			documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			listOverflow: scroller.scrollWidth - scroller.clientWidth,
			listBottom: scroller.getBoundingClientRect().bottom,
			renderedRows: rows.length,
			overlaps: rows.slice(1).filter((row, i) => row.getBoundingClientRect().top < rows[i].getBoundingClientRect().bottom - 1).length,
			rows: rows.map(row => ({
				index: Number(row.dataset.index), height: row.getBoundingClientRect().height,
				cardHeight: row.querySelector('article')!.getBoundingClientRect().height,
				titleHeight: row.querySelector('[data-record-title]')!.getBoundingClientRect().height,
			})),
		};
	});
}

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 844 }, { width: 320, height: 480 }]) {
	test(`compact layout ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
		await page.setViewportSize(viewport);
		await mockTrip(page, makeRecords(200));
		await expect(page.locator('[data-record-id="r2"]')).toBeAttached();
		await page.evaluate(() => document.fonts.ready.then(() => undefined));
		await expect.poll(async () => (await measurements(page)).overlaps).toBe(0);
		const data = await measurements(page);
		expect(data.documentOverflow).toBe(0);
		expect(data.listOverflow).toBe(0);
		expect(data.listBottom).toBeLessThanOrEqual(viewport.height);
		expect(data.renderedRows).toBeLessThan(30);
		for (const row of data.rows) {
			expect(row.titleHeight).toBeLessThanOrEqual(48);
			// Allow platform font differences while keeping cards reasonably compact.
			expect(row.cardHeight + 12).toBeLessThanOrEqual(220);
		}
		await expect(page.locator('[data-record-id="r1"] [data-record-amount]')).toHaveText('$1,234,567,890,123.45');
		const more = page.locator('[data-record-id="r0"]').getByRole('button', { name: /^編輯/ });
		const box = await more.boundingBox();
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
		const metricsPath = testInfo.outputPath('layout.json');
		const screenshotPath = testInfo.outputPath('layout.png');
		await writeFile(metricsPath, JSON.stringify(data, null, 2));
		await page.screenshot({ style: 'nextjs-portal { visibility: hidden; }', path: screenshotPath, fullPage: true });
		await testInfo.attach('layout.json', { path: metricsPath, contentType: 'application/json' });
		await testInfo.attach('layout.png', { path: screenshotPath, contentType: 'image/png' });
		await page.getByRole('region', { name: '帳目列表' }).evaluate(el => { el.scrollTop = el.scrollHeight; });
		await expect(page.locator('[data-record-id="r199"]')).toBeVisible();
		expect((await measurements(page)).overlaps).toBe(0);
	});
}

test('details preserve full text and restore focus after virtual row unmount', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 844 });
	const records = makeRecords(200);
	records[0].name = chinese;
	records[0].shouldPayAddress = Array.from({ length: 50 }, (_, i) => ({ id: `member-${i}`, name: `Member ${i} ${english}` }));
	await mockTrip(page, records);
	const trigger = page.locator('[data-record-id="r0"]').getByRole('button', { name: /^查看/ });
	await trigger.click();
	const dialog = page.getByRole('dialog', { name: '帳目詳情' });
	await expect(dialog.getByText(chinese, { exact: true })).toBeVisible();
	await expect(dialog.getByText(addresses[0].name, { exact: true })).toBeAttached();
	await expect(dialog.getByRole('listitem')).toHaveCount(50);
	expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await trigger.click();
	await page.getByRole('region', { name: '帳目列表', includeHidden: true }).evaluate(el => { el.scrollTop = el.scrollHeight; });
	await expect(page.locator('[data-record-id="r0"]')).toHaveCount(0);
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('region', { name: '帳目列表' })).toBeFocused();
});

test('edit button opens form', async ({ page }) => {
	await mockTrip(page, makeRecords(200));
	const trigger = page.locator('[data-record-id="r0"]').getByRole('button', { name: /^編輯/ });
	await trigger.click();
	await expect(page.locator('form').getByLabel('項目名稱', { exact: true })).toHaveValue('Lunch');
});

test('delete errors allow retry and busy state prevents duplicate submission', async ({ page }) => {
	const state = await mockTrip(page, makeRecords(10));
	state.failDelete = true;
	state.delayDelete = 400;
	await page.locator('[data-record-id="r0"]').getByRole('button', { name: /^刪除/ }).click();
	const dialog = page.getByRole('dialog', { name: '刪除帳目' });
	await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(dialog.getByRole('button', { name: /Processing/ })).toBeDisabled();
	await expect(dialog.getByRole('alert')).toHaveText('Deletion unavailable');
	expect(state.mutationCount).toBe(1);
	state.failDelete = false;
	await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await expect(page.locator('[data-record-id="r0"]')).toHaveCount(0);
	expect(state.mutationCount).toBe(2);
});

test('history, large list, resize, date grouping and refreshed data', async ({ page }) => {
	await page.clock.install();
	const records = makeRecords(1000);
	records[0].isValid = false;
	records[1].isActive = false;
	records[2].isDeleted = true;
	const state = await mockTrip(page, records);
	await history(page);
	await expect(page.locator('[data-record-id="r0"]').getByRole('img', { name: '無效帳目' })).toBeVisible();
	await expect(page.locator('[data-record-id="r1"]').getByRole('img', { name: '舊版本' })).toBeVisible();
	await expect(page.locator('[data-record-id="r2"]').getByRole('img', { name: '已刪除' })).toBeVisible();
	await expect(page.locator('[data-record-id="r1"]').getByRole('button', { name: /^編輯/ })).toHaveCount(0);
	await page.locator('[data-record-id="r1"]').getByRole('button', { name: /^查看/ }).click();
	await expect(page.getByRole('dialog').getByText('舊版本', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	const scroller = page.getByRole('region', { name: '帳目列表' });
	for (const fraction of [0.7, 0.2, 0.9, 1]) {
		await scroller.evaluate((el, fraction) => { el.scrollTop = el.scrollHeight * fraction; }, fraction);
		await page.evaluate(() => document.fonts.ready.then(() => undefined));
		await expect.poll(async () => (await measurements(page)).overlaps).toBe(0);
	}
	await expect(page.locator('[data-record-id="r999"]')).toBeVisible();
	await page.setViewportSize({ width: 320, height: 480 });
	await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
	await expect(page.locator('[data-record-id="r999"]')).toBeVisible();
	expect((await measurements(page)).renderedRows).toBeLessThan(30);
	state.records = [...state.records, { ...records[999], id: 'new', name: 'Fresh record', time: String(Number(records[999].time) + 86400000) }];
	await page.clock.fastForward(21000);
	await expect.poll(async () => page.getByRole('listitem').first().getAttribute('aria-setsize')).toBe('1001');
	await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
	await expect(page.getByText('Fresh record', { exact: true })).toBeVisible();
	await expect(page.getByText(new Date(Number(state.records.at(-1)!.time)).toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' }), { exact: true })).toBeVisible();
	await history(page);
	await expect(page.locator('[data-record-id="r1"]')).toHaveCount(0);
});

test('empty list and empty history remain usable', async ({ page }) => {
	await mockTrip(page, []);
	await expect(page.getByText('尚無帳目，到「記帳」分頁開始記帳')).toBeVisible();
	await history(page);
	await expect(page.getByText('沒有歷史帳目')).toBeVisible();
	await expect(page.getByRole('button', { name: '記帳', exact: true })).toBeVisible();
});

test.describe('local calendar grouping', () => {
	test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
	test('spring daylight-saving transition still separates midnight records', async ({ page }) => {
		const records = makeRecords(3);
		for (const [index, time] of ['2026-03-08T00:10:00-05:00', '2026-03-09T00:10:00-04:00', '2026-03-09T01:10:00-04:00'].entries()) {
			records[index].time = String(Date.parse(time));
			records[index].name = `Record ${index}`;
		}
		await mockTrip(page, records);
		await expect(page.getByText('3/8/2026', { exact: true })).toHaveCount(1);
		await expect(page.getByText('3/9/2026', { exact: true })).toHaveCount(1);
	});
});

for (const width of [320, 390, 430]) {
 test(`mobile navigation and long header ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    const name = chinese + english + '🧑🏽‍🍳'.repeat(20);
    await mockTrip(page, makeRecords(200), name);
    const header = page.locator('header');
    const metrics = await header.evaluate(el => {
        const title = el.querySelector('h1')!.getBoundingClientRect();
        const buttons = [...el.querySelectorAll('button')].filter(el => el.getBoundingClientRect().width).map(el => {
            const { width, height, left, right } = el.getBoundingClientRect();
            return { width, height, left, right };
        });
        const nav = document.querySelector('nav[aria-label="行程導覽"]')!.getBoundingClientRect();
        const list = document.querySelector('[aria-label="帳目列表"]')!.getBoundingClientRect();
        return { titleHeight: title.height, titleLeft: title.left, titleRight: title.right, buttons,
            overflow: document.documentElement.scrollWidth - innerWidth, navTop: nav.top, navBottom: nav.bottom, listBottom: list.bottom };
    });
    expect(metrics.overflow).toBe(0);
    expect(metrics.titleHeight).toBeLessThanOrEqual(56);
    expect(metrics.buttons).toHaveLength(2);
    for (const button of metrics.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
    }
    expect(metrics.titleLeft).toBeGreaterThanOrEqual(metrics.buttons[0].right);
    expect(metrics.titleRight).toBeLessThanOrEqual(metrics.buttons[1].left);
    expect(metrics.listBottom).toBeLessThanOrEqual(metrics.navTop);
    expect(metrics.navBottom).toBeLessThanOrEqual(700);
    await page.screenshot({ style: 'nextjs-portal { visibility: hidden; }', path: testInfo.outputPath('mobile.png') });
    await writeFile(testInfo.outputPath('mobile.json'), JSON.stringify(metrics, null, 2));
    await testInfo.attach('mobile.png', { path: testInfo.outputPath('mobile.png'), contentType: 'image/png' });
    await testInfo.attach('mobile.json', { path: testInfo.outputPath('mobile.json'), contentType: 'application/json' });
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog').getByText(name, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '記帳', exact: true }).click();
    const form = page.getByRole('form', { name: '新增帳目' });
    await form.getByLabel('項目名稱', { exact: true }).fill('草稿');
    await form.getByLabel('金額', { exact: true }).fill('123');
    await page.getByRole('button', { name: '成員', exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.getByRole('button', { name: '記帳', exact: true }).click();
    await expect(form.getByLabel('項目名稱', { exact: true })).toHaveValue('草稿');
    await expect(form.getByLabel('金額', { exact: true })).toHaveValue('123');
    await page.setViewportSize({ width, height: 400 });
    await form.getByRole('button', { name: '取消', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.screenshot({ style: 'nextjs-portal { visibility: hidden; }', path: testInfo.outputPath('form-short-viewport.png') });
    await form.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('button', { name: '帳目', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: '記帳', exact: true }).click();
    await expect(page.getByLabel('項目名稱', { exact: true })).toHaveValue('');
 });
}

test('replacing a draft requires confirmation and editing uses the entry page', async ({ page }) => {
 await mockTrip(page, makeRecords(10));
 await page.getByRole('button', { name: '記帳', exact: true }).click();
 await page.getByLabel('項目名稱', { exact: true }).fill('保留內容');
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 const edit = async () => {
    await page.locator('[data-record-id="r0"]').getByRole('button', { name: /^編輯/ }).click();
 };
 await edit();
 await page.getByRole('button', { name: '保留草稿' }).click();
 await page.getByRole('button', { name: '記帳', exact: true }).click();
 await expect(page.getByLabel('項目名稱', { exact: true })).toHaveValue('保留內容');
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await edit();
 await page.getByRole('button', { name: '捨棄並開啟' }).click();
 await expect(page.getByRole('form', { name: '編輯帳目' })).toBeVisible();
 await expect(page.getByLabel('項目名稱', { exact: true })).toHaveValue('Lunch');
 await expect(page.getByRole('button', { name: '記帳', exact: true })).toHaveAttribute('aria-current', 'page');
 await page.getByRole('button', { name: '取消', exact: true }).click();
 await expect(page.getByRole('region', { name: '帳目列表' })).toBeVisible();
});


test('entry submission preserves failed draft and blocks duplicate requests', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 700 });
 const state = await mockTrip(page, []);
 let requests = 0;
 let fail = true;
 let release: (() => void) | undefined;
 await page.route('**/query', async route => {
    const body = route.request().postDataJSON();
    if (body.operationName !== 'CreateRecord') return route.fallback();
    requests++;
    await new Promise<void>(resolve => { release = resolve; });
    if (fail) return route.fulfill({ json: { errors: [{ message: 'Try again' }] } });
    const record = { ...makeRecords(1)[0], name: body.variables.input.name };
    state.records = [record];
    return route.fulfill({ json: { data: { createRecord: record } } });
 });
 await page.getByRole('button', { name: '記帳', exact: true }).click();
 const form = page.getByRole('form', { name: '新增帳目' });
 await form.getByLabel('項目名稱', { exact: true }).fill('Retry lunch');
 await form.getByLabel('金額', { exact: true }).fill('300');
 await form.getByRole('checkbox').first().check();
 await form.getByRole('button', { name: '新增', exact: true }).click();
 await expect(form.getByRole('button', { name: /Saving/ })).toBeDisabled();
 await expect(form.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
 await expect.poll(() => requests).toBe(1);
 await form.evaluate(el => el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(requests).toBe(1);
 release!();
 await expect(page.getByRole('main').getByRole('alert')).toContainText('Try again');
 await expect(form.getByLabel('項目名稱', { exact: true })).toHaveValue('Retry lunch');
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.getByRole('button', { name: '記帳', exact: true }).click();
 await expect(form.getByLabel('金額', { exact: true })).toHaveValue('300');
 fail = false;
 await form.getByRole('button', { name: '新增', exact: true }).click();
 await expect.poll(() => requests).toBe(2);
 release!();
 await expect(form).toHaveCount(0);
 await expect(page.getByRole('status').filter({ hasText: '帳目已儲存' })).toBeAttached();
 await expect(page.getByRole('main')).toBeFocused();
 await expect(page.getByRole('button', { name: '查看 Retry lunch' })).toBeVisible();
});


test('keyboard-sized visual viewport keeps entry actions and navigation reachable', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await mockTrip(page, []);
 await page.getByRole('button', { name: '記帳', exact: true }).click();
 await page.getByLabel('項目名稱', { exact: true }).focus();
 // Model a keyboard reducing only the visual viewport, leaving layout height unchanged.
 await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 400 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 const nav = page.getByRole('navigation', { name: '行程導覽' });
 await expect.poll(async () => (await nav.boundingBox())!.y + (await nav.boundingBox())!.height).toBeLessThanOrEqual(400);
 const submit = page.getByRole('form').getByRole('button', { name: '新增', exact: true });
 await submit.scrollIntoViewIfNeeded();
 const box = (await submit.boundingBox())!;
 expect(box.y + box.height).toBeLessThanOrEqual((await nav.boundingBox())!.y);
 await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 await expect.poll(async () => (await nav.boundingBox())!.y + (await nav.boundingBox())!.height).toBe(844);
});

async function selectMember(page: Page, memberId: string, role: '相關' | '付款' | '分攤' = '相關') {
 await page.getByRole('button', { name: /^成員篩選：/ }).click();
 const dialog = page.getByRole('dialog', { name: '成員篩選', exact: true });
 await dialog.getByLabel('成員', { exact: true }).selectOption(memberId);
 if (memberId) await dialog.getByRole('radio', { name: role, exact: true }).check();
 await dialog.getByRole('button', { name: '套用', exact: true }).click();
}

async function listPosition(page: Page) {
 return page.getByRole('region', { name: '帳目列表' }).evaluate(el => {
  const top = el.getBoundingClientRect().top;
  const first = [...el.querySelectorAll<HTMLElement>('[data-row-id]')].find(row => row.getBoundingClientRect().bottom > top);
  return { id: first?.dataset.rowId, offset: first ? first.getBoundingClientRect().top - top : 0, scrollTop: el.scrollTop };
 });
}

async function expectPosition(page: Page, position: Awaited<ReturnType<typeof listPosition>>) {
 await expect.poll(async () => (await listPosition(page)).id).toBe(position.id);
 await expect.poll(async () => Math.abs((await listPosition(page)).offset - position.offset)).toBeLessThanOrEqual(4);
 await expect(page.locator(`[data-row-id="${position.id}"]`)).toBeVisible();
}

test('name and member filters combine roles, draft cancellation, reset and history', async ({ page }) => {
 const records = makeRecords(4);
 records.forEach((record, i) => { record.name = ['Lunch paid', 'Lunch shared', 'Lunch both', 'Dinner'][i]; });
 records[0].shouldPayAddress = [addresses[1]];
 records[1].prePayAddress = addresses[1];
 records[1].shouldPayAddress = [addresses[0]];
 records[3].isActive = false;
 await mockTrip(page, records);
 const search = page.getByRole('textbox', { name: '搜尋項目名稱' });
 await search.fill('  LUNCH  ');
 await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-setsize', '3');
 await selectMember(page, 'a', '付款');
 await expect(page.locator('[data-record-id="r1"]')).toHaveCount(0);
 await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-setsize', '2');
 await selectMember(page, 'a', '分攤');
 await expect(page.locator('[data-record-id="r0"]')).toHaveCount(0);
 await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-setsize', '2');
 await selectMember(page, 'a');
 await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-setsize', '3');
 await page.getByRole('button', { name: /^成員篩選：/ }).click();
 const dialog = page.getByRole('dialog', { name: '成員篩選', exact: true });
 await dialog.getByRole('radio', { name: '付款', exact: true }).check();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button', { name: /^成員篩選：/ })).toHaveAccessibleName(/相關$/);
 await page.getByRole('button', { name: /^成員篩選：/ }).click();
 await expect(dialog.getByRole('radio', { name: '相關', exact: true })).toBeChecked();
 await dialog.getByRole('button', { name: '重設', exact: true }).click();
 await expect(dialog.getByRole('radio')).toHaveCount(0);
 await dialog.getByRole('button', { name: '套用', exact: true }).click();
 await expect(search).toHaveValue('  LUNCH  ');
 await search.fill('Dinner');
 await expect(page.getByText('沒有符合條件的帳目')).toBeVisible();
 await history(page);
 await expect(page.locator('[data-record-id="r3"]')).toBeVisible();
 await search.fill('No match');
 await page.getByRole('button', { name: '清除篩選', exact: true }).click();
 await expect(search).toHaveValue('');
 await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-setsize', '4');
});

for (const fraction of [0.55, 1]) {
 test(`long list preserves position and filters across tabs and edit cancel/save at ${fraction}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const records = makeRecords(1000).map((record, i) => ({ ...record, name: `Lunch ${i}` }));
  await mockTrip(page, records);
  await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('Lunch');
  await selectMember(page, 'a', '付款');
  const scroller = page.getByRole('region', { name: '帳目列表' });
  // Keep an identity marker to verify switching tabs preserves the actual scroll container.
  await scroller.evaluate((el, fraction) => { el.setAttribute('data-preserved', 'yes'); el.scrollTop = el.scrollHeight * fraction; }, fraction);
  await expect.poll(async () => (await listPosition(page)).scrollTop).toBeGreaterThan(10000);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const position = await listPosition(page);
  const tabPositions = [];
  for (const tab of ['成員', '分帳', '記帳']) {
   await page.getByRole('button', { name: tab, exact: true }).click();
   await expect(scroller).not.toBeVisible();
   if (tab === '記帳') {
    await page.setViewportSize({ width: 390, height: 480 });
    await page.getByRole('form', { name: '新增帳目' }).getByRole('button', { name: '新增', exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => page.getByRole('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 390, height: 844 });
   }
   await page.getByRole('button', { name: '帳目', exact: true }).click();
   await expect(scroller).toHaveAttribute('data-preserved', 'yes');
   await expectPosition(page, position);
   await expect.poll(async () => Math.abs((await listPosition(page)).scrollTop - position.scrollTop)).toBeLessThanOrEqual(4);
   await expect(page.getByRole('textbox', { name: '搜尋項目名稱' })).toHaveValue('Lunch');
   await expect(page.getByRole('button', { name: /^成員篩選：/ })).toHaveAccessibleName(/付款$/);
   tabPositions.push({ tab, before: position, after: await listPosition(page) });
  }
  await testInfo.attach('tab-scroll-positions.json', { body: JSON.stringify(tabPositions, null, 2), contentType: 'application/json' });
  for (const save of [false, true]) {
   const card = page.locator(`[data-record-id="${position.id}"]`);
   await card.getByRole('button', { name: /^編輯/ }).click();
   const beforeEdit = await page.locator('[aria-label="帳目列表"]').getAttribute('data-preserved');
   expect(beforeEdit).toBe('yes');
   const form = page.getByRole('form', { name: '編輯帳目' });
   if (save) {
    await form.getByLabel('項目名稱', { exact: true }).fill('Lunch edited');
    await form.getByRole('button', { name: '儲存變更', exact: true }).click();
   } else await form.getByRole('button', { name: '取消', exact: true }).click();
   await expect(page.getByRole('textbox', { name: '搜尋項目名稱' })).toHaveValue('Lunch');
   await expect(page.getByRole('button', { name: /^成員篩選：/ })).toHaveAccessibleName(/付款$/);
   await expectPosition(page, position);
  }
  expect((await measurements(page)).renderedRows).toBeLessThan(30);
  await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('Lunch 99');
  await expect.poll(async () => (await listPosition(page)).scrollTop).toBe(0);
 });
}

test('updates preserve the reading anchor and fall back to its next surviving record', async ({ page }) => {
 await page.clock.install();
 const records = makeRecords(1000).map((record, i) => ({ ...record, name: `Lunch ${i}` }));
 const state = await mockTrip(page, records);
 const scroller = page.getByRole('region', { name: '帳目列表' });
 await scroller.evaluate(el => { el.scrollTop = 50000; });
 await page.clock.runFor(300);
 const position = await listPosition(page);
 await page.getByRole('button', { name: '成員', exact: true }).click();
 state.records = [{ ...records[0], id: 'inserted', time: String(Number(records[0].time) - 86400000) }, ...records];
 await page.clock.fastForward(21000);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(500);
 await expectPosition(page, position);
 const index = records.findIndex(record => record.id === position.id);
 // A measured row above the anchor changes height without changing its identity.
 state.records = state.records.map(record => record.id === records[index - 1].id ? { ...record, name: chinese } : record);
 await page.clock.fastForward(21000);
 await page.clock.runFor(500);
 await expectPosition(page, position);
 state.records = state.records.filter(record => record.id !== position.id);
 await page.clock.fastForward(21000);
 await page.clock.runFor(500);
 await expectPosition(page, { ...position, id: records[index + 1].id });
});

test('editing out of a filter keeps the filter and nearby reading position', async ({ page }) => {
 const records = makeRecords(1000).map((record, i) => ({ ...record, name: `Lunch ${i}` }));
 const state = await mockTrip(page, records);
 state.versionEdits = true;
 await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('Lunch');
 await page.getByRole('region', { name: '帳目列表' }).evaluate(el => { el.scrollTop = 50000; });
 await expect.poll(async () => (await listPosition(page)).scrollTop).toBeGreaterThan(40000);
 const initial = await listPosition(page);
 const edit = page.locator(`[data-record-id="${initial.id}"]`).getByRole('button', { name: /^編輯/ });
 // Playwright may scroll a partly clipped button before clicking. Measure the
 // departure position after that actionability scroll, not before it.
 await edit.click({ trial: true });
 const position = await listPosition(page);
 expect(position.id).toBe(initial.id);
 const index = records.findIndex(record => record.id === position.id);
 await edit.click();
 const form = page.getByRole('form', { name: '編輯帳目' });
 await form.getByLabel('項目名稱', { exact: true }).fill('Dinner instead');
 await form.getByRole('button', { name: '儲存變更', exact: true }).click();
 await expect(page.getByRole('textbox', { name: '搜尋項目名稱' })).toHaveValue('Lunch');
 await expectPosition(page, { ...position, id: records[index + 1].id });
 await expect(page.locator(`[data-record-id="${position.id}"]`)).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
 test(`filter controls fit small viewports and return focus at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 480 });
  await mockTrip(page, makeRecords(200));
  await selectMember(page, 'a', '分攤');
  const button = page.getByRole('button', { name: /^成員篩選：/ });
  await expect(button).toBeFocused();
  await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('Lunch');
  expect((await measurements(page)).documentOverflow).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('filters.png') });
  await button.click();
  await page.setViewportSize({ width, height: 320 });
  const dialog = page.getByRole('dialog', { name: '成員篩選', exact: true });
  await dialog.getByRole('button', { name: '套用', exact: true }).scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('filter-sheet.png') });
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
 });
}

const previewCases = [
 { category: RecordCategory.NORMAL, label: '均分', values: [], details: ['參與均分', '參與均分', '參與均分'] },
 { category: RecordCategory.FIX, label: '按金額', values: [10.1234, 20, 0], details: ['分攤 $10.1234', '分攤 $20', '分攤 $0'] },
 { category: RecordCategory.PART, label: '按份數', values: [1.5, 2, 0], details: ['1.5 份', '2 份', '0 份'] },
 { category: RecordCategory.FIX_BEFORE_NORMAL, label: '指定金額後均分', values: [-20, 0, 10], details: ['指定 $20・不參與剩餘均分', '僅參與剩餘均分', '指定 $10・另參與剩餘均分'] },
 { category: RecordCategory.TRANSFER, label: '自動還款', values: [10, 20, 0], details: ['收款 $10', '收款 $20', '收款 $0'] },
 { category: RecordCategory.FIX, label: '設定不完整', values: [10], details: ['分攤 $10', '分攤設定未提供', '分攤設定未提供'] },
];

for (const example of previewCases) {
 test(`preview shows recorded split settings without editing: ${example.label}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const record = {
   ...makeRecords(1)[0], category: example.category, extendPayMsg: example.values,
   shouldPayAddress: [{ id: 'c', name: 'Charlie' }, { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }],
   isValid: example.label !== '設定不完整',
  };
  const state = await mockTrip(page, [record]);
  const trigger = page.getByRole('button', { name: '查看 Lunch', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '帳目詳情' });
  if (example.label !== '設定不完整') await expect(dialog.getByText(example.label, { exact: true })).toBeVisible();
  const members = dialog.getByRole('listitem');
  await expect(members).toHaveCount(3);
  for (const [index, description] of example.details.entries()) {
   await expect(members.nth(index)).toContainText(record.shouldPayAddress[index].name);
   await expect(members.nth(index)).toContainText(description);
  }
  if (example.category === RecordCategory.TRANSFER) await expect(dialog.getByText('收款成員（3）')).toBeAttached();
  if (!record.isValid) await expect(dialog.getByText('無效帳目', { exact: true })).toBeAttached();
  await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
  expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  if (example.category === RecordCategory.FIX_BEFORE_NORMAL) {
   await members.last().scrollIntoViewIfNeeded();
   const screenshot = testInfo.outputPath('split-preview.png');
   await page.screenshot({ path: screenshot });
   await testInfo.attach('split-preview.png', { path: screenshot, contentType: 'image/png' });
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', { name: '帳目', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('form', { name: '編輯帳目' })).toHaveCount(0);
  expect(state.mutationCount).toBe(0);
 });
}

test('member filter draft remains explicit if its member disappears during synchronization', async ({ page }) => {
 await page.clock.install();
 const ghost = { id: 'ghost', name: 'Temporary member' };
 const records = makeRecords(2);
 records[0].prePayAddress = ghost;
 const state = await mockTrip(page, records);
 await page.getByRole('button', { name: /^成員篩選：/ }).click();
 const dialog = page.getByRole('dialog', { name: '成員篩選', exact: true });
 const member = dialog.getByLabel('成員', { exact: true });
 await member.selectOption(ghost.id);
 state.records = [records[1]];
 await page.clock.fastForward(21000);
 await expect(dialog.getByRole('option', { name: 'Temporary member' })).toHaveCount(0);
 await expect(member).toHaveValue(ghost.id);
 await expect(dialog.getByRole('option', { name: '已移除成員' })).toBeAttached();
 await dialog.getByRole('button', { name: '套用', exact: true }).click();
 await expect(page.getByRole('button', { name: /^成員篩選：/ })).toHaveAccessibleName(/已移除成員/);
 await expect(page.getByText('沒有符合條件的帳目')).toBeVisible();
 await page.getByRole('button', { name: '清除篩選', exact: true }).click();
 await expect(page.locator('[data-record-id="r1"]')).toBeVisible();
});

test('long preview keeps its close button reachable while reading the last member', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 480 });
 const record = makeRecords(1)[0];
 record.shouldPayAddress = Array.from({ length: 50 }, (_, i) => ({ id: `member-${i}`, name: `Member ${i}` }));
 await mockTrip(page, [record]);
 const trigger = page.getByRole('button', { name: '查看 Lunch', exact: true });
 await trigger.click();
 const dialog = page.getByRole('dialog', { name: '帳目詳情' });
 await dialog.getByRole('listitem').last().scrollIntoViewIfNeeded();
 const close = dialog.getByRole('button', { name: '關閉詳情' });
 await expect(close).toBeInViewport();
 const header = dialog.getByRole('heading', { name: '帳目詳情' }).locator('..');
 expect(Math.abs((await header.boundingBox())!.y - (await dialog.boundingBox())!.y)).toBeLessThanOrEqual(1);
 const bounds = (await close.boundingBox())!;
 await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
 await expect(dialog).not.toBeVisible();
 await expect(trigger).toBeFocused();
});

test('a zero-height list waits for layout instead of retrying every animation frame', async ({ page }) => {
 await page.clock.install();
 await mockTrip(page, makeRecords(200));
 const scroller = page.getByRole('region', { name: '帳目列表' });
 await page.clock.runFor(300);
 await scroller.evaluate(el => { (el as HTMLElement).style.flex = '0 0 0px'; });
 await expect.poll(() => scroller.evaluate(el => el.clientHeight)).toBe(0);
 await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('Lunch');
 await page.clock.runFor(100);
 await page.evaluate(() => {
  const original = window.requestAnimationFrame;
  let frames = 0;
  Object.defineProperty(window, 'listRestoreFrames', { configurable: true, get: () => frames });
  window.requestAnimationFrame = callback => { frames++; return original.call(window, callback); };
 });
 await page.clock.runFor(500);
 expect(await page.evaluate(() => Reflect.get(window, 'listRestoreFrames'))).toBeLessThan(5);
 await scroller.evaluate(el => { (el as HTMLElement).style.removeProperty('flex'); });
 await page.clock.runFor(300);
 await expect(page.locator('[data-record-id="r0"]')).toBeVisible();
 await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
});

test('unfiltered hidden list restores nearby records through resize, removal and replacement', async ({ page }) => {
 await page.clock.install();
 await page.setViewportSize({ width: 390, height: 844 });
 const records = makeRecords(1000);
 const state = await mockTrip(page, records);
 const scroller = page.getByRole('region', { name: '帳目列表' });
 // Finish the initial position restore before requesting a distant virtual range.
 await expect(page.locator('[data-record-id="r0"]')).toBeVisible();
 await scroller.evaluate(el => { el.scrollTop = 50000; });
 // Clock advancement alone does not guarantee native scroll/resize delivery or a
 // React commit. Wait for a visible row and align its boundary before capturing it.
 await expect.poll(async () => {
  await page.clock.runFor(100);
  return scroller.evaluate(el => {
   const bounds = el.getBoundingClientRect();
   const first = [...el.querySelectorAll<HTMLElement>('[data-row-id]')].find(row => {
    const rect = row.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom && getComputedStyle(row).visibility === 'visible';
   });
   if (!first || el.scrollTop < 40000) return false;
   const offset = first.getBoundingClientRect().top - bounds.top;
   if (Math.abs(offset) <= 1) return true;
   el.scrollTop += offset;
   return false;
  });
 }, { message: 'distant virtual row is rendered and aligned with the list viewport' }).toBe(true);
 const position = await listPosition(page);
 const index = records.findIndex(record => record.id === position.id);
 expect(index).toBeGreaterThan(0);
 expect(index).toBeLessThan(records.length - 1);
 await page.getByRole('button', { name: '成員', exact: true }).click();
 await page.setViewportSize({ width: 320, height: 480 });
 state.records = records.filter(record => record.id !== position.id);
 await page.clock.fastForward(21000);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(500);
 await expectPosition(page, { ...position, id: records[index + 1].id });

 await page.getByRole('button', { name: '成員', exact: true }).click();
 const newRecords = records.map((record, i) => ({ ...record, id: `replacement-${i}`, time: String(Number(records.at(-1)!.time) + 60000 * (i + 1)) }));
 // No old successor survives; the nearest old predecessor is the fallback.
 state.records = [...records.slice(0, index), ...newRecords];
 await page.clock.fastForward(21000);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(500);
 await expectPosition(page, { ...position, id: records[index - 1].id });

 const beforeReplacement = await listPosition(page);
 await page.getByRole('button', { name: '成員', exact: true }).click();
 state.records = newRecords.map(record => ({ ...record, id: `fresh-${record.id}` }));
 await page.clock.fastForward(21000);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(500);
 await expect.poll(async () => Math.abs((await listPosition(page)).scrollTop - beforeReplacement.scrollTop)).toBeLessThanOrEqual(4);
 expect((await measurements(page)).renderedRows).toBeLessThan(30);

 await page.getByRole('button', { name: '成員', exact: true }).click();
 state.records = newRecords.slice(0, 3).map(record => ({ ...record, id: `short-${record.id}` }));
 await page.clock.fastForward(21000);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(500);
 await expect(page.locator('[data-record-id="short-replacement-2"]')).toBeVisible();
 expect(await scroller.evaluate(el => Math.abs(el.scrollTop - Math.max(0, el.scrollHeight - el.clientHeight)))).toBeLessThanOrEqual(4);
});

test('history changes reset only list position and a reload clears session filters', async ({ page }) => {
 await page.clock.install();
 await mockTrip(page, makeRecords(1000));
 const search = page.getByRole('textbox', { name: '搜尋項目名稱' });
 await search.fill('Lunch');
 await selectMember(page, 'a', '付款');
 const scroller = page.getByRole('region', { name: '帳目列表' });
 await scroller.evaluate(el => { el.scrollTop = 10000; });
 await page.clock.runFor(300);
 await page.getByRole('button', { name: '成員', exact: true }).click();
 await history(page);
 await page.getByRole('button', { name: '帳目', exact: true }).click();
 await page.clock.runFor(300);
 await expect(search).toHaveValue('Lunch');
 await expect(page.getByRole('button', { name: /^成員篩選：/ })).toHaveAccessibleName(/付款$/);
 await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
 await page.reload();
 await expect(search).toHaveValue('');
 await expect(page.getByRole('button', { name: '成員篩選：成員', exact: true })).toBeVisible();
});

test.describe('English search casing across browser languages', () => {
 test.use({ locale: 'tr-TR' });
 test('English I matches i regardless of the browser language', async ({ page }) => {
  const record = { ...makeRecords(1)[0], name: 'DINNER' };
  await mockTrip(page, [record]);
  await page.getByRole('textbox', { name: '搜尋項目名稱' }).fill('dinner');
  await expect(page.locator('[data-record-id="r0"]')).toBeVisible();
 });
});
