import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { RecordCategory, type Record } from '../src/app/lib/tripApi/types';

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
	const state = { records: initial, mutationCount: 0, failDelete: false, failQuery: false, delayDelete: 0 };
	await page.route('**/query', async route => {
		const body = route.request().postDataJSON();
		if (body.operationName === 'UpdateRecord') {
			state.mutationCount++;
			if (state.delayDelete) await new Promise(resolve => setTimeout(resolve, state.delayDelete));
			if (state.failDelete) return route.fulfill({ json: { errors: [{ message: 'Deletion unavailable' }] } });
			const record = state.records.find(record => record.id === body.variables.recordId)!;
			const updated = { ...record, isDeleted: true };
			state.records = state.records.map(item => item.id === record.id ? updated : item);
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
