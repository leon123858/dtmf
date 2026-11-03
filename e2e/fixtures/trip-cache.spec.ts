import { test, expect, type Page, type Route } from '@playwright/test';
import type { TripPayload, RecordPayload, NewRecordInput } from '../../src/app/lib/tripApi/types';
import { RecordCategory } from '../../src/app/lib/tripApi/types';

const alice = { __typename: 'Address', bind: null, useNickname: false, id: 'alice', name: 'Alice', statistics: { totalExpense: 50, totalPrepaid: 100, activeRecordCount: 1 } };
const bob = { __typename: 'Address', bind: null, useNickname: false, id: 'bob', name: 'Bob', statistics: { totalExpense: 50, totalPrepaid: 0, activeRecordCount: 1 } };
const initialRecord = {
  __typename: 'Record', id: 'r1', name: 'Lunch', amount: 100, prePayAddress: alice,
  shouldPayAddress: [alice, bob], extendPayMsg: [50, 50], category: RecordCategory.NORMAL,
  time: '1789056000000', isValid: true, isDeleted: false, isActive: true, parentRecordId: null,
};

const snapshot = ({ id, name }: { id: string; name: string }) => ({ __typename: 'AddressSnapshot', useNickname: false, id, name });

async function fixture(page: Page) {
  await page.clock.install();
  const state = {
    queries: [] as boolean[], mutations: [] as string[], failQuery: false, failMutation: false,
    holdNextQuery: false, release: undefined as (() => Promise<void>) | undefined,
    trip: {
      __typename: 'Trip', private: false, users: [], id: 'cache-probe', name: 'Cache probe', records: [initialRecord] as RecordPayload[],
      addresses: [alice, bob], moneyShare: [], isValid: true,
    } as TripPayload,
  };
  await page.route('**/query', async (route: Route) => {
    const { operationName, variables } = route.request().postDataJSON();
    if (operationName === 'GetTrip') {
      state.queries.push(variables.haveHistory);
      if (state.failQuery) return route.fulfill({ status: 503, json: { errors: [{ message: 'Offline' }] } });
      const snapshot = structuredClone({ ...state.trip,
        records: state.trip.records.filter(record => variables.haveHistory || (record.isActive && !record.isDeleted)),
      });
      const fulfill = () => route.fulfill({ json: { data: { trip: snapshot } } });
      if (state.holdNextQuery) { state.holdNextQuery = false; state.release = fulfill; return; }
      return fulfill();
    }
    state.mutations.push(operationName);
    if (state.failMutation) return route.fulfill({ json: { errors: [{ message: 'Write rejected' }] } });
    let field: string;
    let value: unknown;
    if (operationName === 'CreateRecord' || operationName === 'UpdateRecord') {
      const input: NewRecordInput = operationName === 'CreateRecord' ? variables.input : variables.input.new;
      const parent = state.trip.records.find(record => record.id === variables.recordId);
      const record = { ...initialRecord, id: `r${state.mutations.length + 1}`, name: input.name, amount: input.amount,
        isDeleted: input.isDeleted ?? false, parentRecordId: parent?.id ?? null,
        prePayAddress: state.trip.addresses.find(address => address.id === input.prePayAddressId)!,
        shouldPayAddress: state.trip.addresses.filter(address => input.shouldPayAddressIds.includes(address.id)),
      };
      state.trip.records = [...state.trip.records.map(record => record.id === parent?.id ? { ...record, isActive: false } : record), record];
      value = { ...record, __typename: 'RecordSnapshot', prePayAddress: snapshot(record.prePayAddress), shouldPayAddress: record.shouldPayAddress.map(snapshot) };
      field = operationName === 'CreateRecord' ? 'createRecord' : 'updateRecord';
    } else if (operationName === 'CreateAddress') {
      const address = { __typename: 'Address', bind: null, useNickname: false, id: 'guest', name: variables.input.name, statistics: null };
      state.trip.addresses.push(address);
      value = snapshot(address);
      field = 'createAddress';
    } else if (operationName === 'UpdateAddress') {
      const updated = { __typename: 'Address', bind: null, useNickname: false, id: variables.addressId, name: variables.input.name };
      state.trip.addresses = state.trip.addresses.map(address => address.id === updated.id ? { ...address, ...updated } : address);
      value = snapshot(updated);
      field = 'updateAddress';
    } else if (operationName === 'DeleteAddress') {
      value = snapshot(state.trip.addresses.find(address => address.id === variables.addressId)!);
      state.trip.addresses = state.trip.addresses.filter(address => address.id !== variables.addressId);
      field = 'deleteAddress';
    } else throw new Error(`Unexpected operation: ${operationName}`);
    await route.fulfill({ json: { data: { [field]: value } } });
  });
  await page.goto('/trip/cache-probe');
  await expect(page.getByRole('heading', { name: 'Cache probe', exact: true })).toBeVisible();
  await page.addStyleTag({ content: 'nextjs-portal { visibility: hidden; }' });
  expect(state.queries).toEqual([false]);
  return state;
}

async function history(page: Page, enabled: boolean) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: '旅程設定', exact: true }).click();
  await page.getByRole('switch', { name: '顯示紀錄歷史', exact: true }).setChecked(enabled);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
}
async function edit(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: `編輯 ${from}`, exact: true }).click();
  await page.getByLabel('項目名稱', { exact: true }).fill(to);
  await page.getByRole('button', { name: '儲存變更', exact: true }).click();
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `查看 ${to}`, exact: true })).toBeVisible();
}

test('one initial query and one eligible poll, regardless of mounted readers', async ({ page }) => {
  const state = await fixture(page);
  for (const tab of ['分帳', '成員', '記帳', '帳目', '分帳', '成員', '帳目']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
  }
  expect(state.queries).toEqual([false]);
  for (let count = 2; count <= 3; count++) {
    await page.clock.fastForward(40_000);
    await expect.poll(() => state.queries.length).toBe(count);
  }
  await history(page, true);
  await expect.poll(() => state.queries).toEqual([false, false, false, true]);
  await page.clock.fastForward(40_000);
  await expect.poll(() => state.queries).toEqual([false, false, false, true, true]);
  await history(page, false);
  await expect.poll(() => state.queries.length).toBe(6);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: '首頁', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.clock.fastForward(60_000);
  expect(state.queries.length).toBe(6);
});

test('record and member mutations update UI; nickname edits explicitly refresh', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: '記帳', exact: true }).click();
  await page.getByLabel('項目名稱', { exact: true }).fill('Breakfast');
  await page.getByLabel('金額', { exact: true }).fill('120');
  await page.getByRole('checkbox', { name: 'Alice', exact: true }).check();
  await page.getByRole('form').getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 Breakfast', exact: true })).toBeVisible();
  await edit(page, 'Breakfast', 'Brunch');
  await expect(page.getByRole('button', { name: '查看 Breakfast', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '刪除 Brunch', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 Brunch', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '成員', exact: true }).click();
  await page.getByRole('button', { name: '新增成員', exact: true }).click();
  await page.getByPlaceholder('輸入新成員名稱').fill('Guest');
  await page.getByRole('main').getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByText('Guest', { exact: true })).toBeVisible();
  await page.getByText('Guest', { exact: true }).locator('..').getByRole('button', { name: '名稱設定' }).click();
  await page.getByRole('textbox', { name: '設定新旅程暱稱' }).fill('Visitor');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByText('Visitor', { exact: true })).toBeVisible();
  await page.getByText('Visitor', { exact: true }).locator('..').getByRole('button', { name: '移除' }).click();
  await expect(page.getByText('Visitor', { exact: true })).toHaveCount(0);
  expect(state.mutations).toEqual(['CreateRecord', 'UpdateRecord', 'UpdateRecord', 'CreateAddress', 'UpdateAddress', 'DeleteAddress']);
  expect(state.queries).toEqual([false, false]);
});

test('history mutations preserve parents and tombstones without refetching', async ({ page }) => {
  const state = await fixture(page);
  await history(page, true);
  await expect.poll(() => state.queries.length).toBe(2);
  await edit(page, 'Lunch', 'Dinner');
  await expect(page.locator('[data-record-id="r1"]').getByRole('img', { name: '舊版本' })).toBeVisible();
  await page.getByRole('button', { name: '刪除 Dinner', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('[data-record-id="r3"]').getByRole('img', { name: '已刪除' })).toBeVisible();
  expect(state.queries).toEqual([false, true]);
  await history(page, false);
  await expect(page.getByText('尚無帳目，到「記帳」分頁開始記帳')).toBeVisible();
});

test('slow polling holds mutations until the query commits, without extra queries', async ({ page }) => {
  const state = await fixture(page);
  state.holdNextQuery = true;
  await page.clock.fastForward(40_000);
  await expect.poll(() => !!state.release).toBe(true);
  await page.getByRole('button', { name: '編輯 Lunch', exact: true }).click();
  await page.getByLabel('項目名稱', { exact: true }).fill('Dinner');
  await page.getByRole('button', { name: '儲存變更', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving… ⏳', exact: true })).toBeDisabled();
  expect(state.mutations).toEqual([]);
  await page.clock.fastForward(60_000);
  expect(state.queries.length).toBe(2);
  await state.release!();
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看 Dinner', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 Lunch', exact: true })).toHaveCount(0);
  expect(state.mutations).toEqual(['UpdateRecord']);
  expect(state.queries.length).toBe(2);
});

test('failed mutation preserves cache; settlement waits for polling; manual retry preserves the view', async ({ page }) => {
  const state = await fixture(page);
  state.failMutation = true;
  await page.getByRole('button', { name: '刪除 Lunch', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Write rejected');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 Lunch', exact: true })).toBeVisible();
  expect(state.queries.length).toBe(1);
  state.failMutation = false;
  await edit(page, 'Lunch', 'Dinner');
  state.trip.moneyShare = [{ input: [{ amount: 50, address: bob }], output: { amount: 50, address: alice } }];
  await page.getByRole('button', { name: '分帳', exact: true }).click();
  await expect(page.getByText('帳目計算中，或沒有需要分帳的項目。')).toBeVisible();
  expect(state.queries.length).toBe(1);
  await page.clock.fastForward(40_000);
  await expect(page.getByRole('button', { name: 'payback', exact: true })).toBeVisible();
  expect(state.queries.length).toBe(2);
  state.failQuery = true;
  await page.getByRole('button', { name: 'refresh money share' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '更新失敗' })).toContainText('更新失敗');
  await expect(page.getByRole('button', { name: 'payback', exact: true })).toBeVisible();
  expect(state.queries.length).toBe(3);
  state.failQuery = false;
  state.trip.moneyShare = [];
  await page.getByRole('button', { name: '重試', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '更新失敗' })).toHaveCount(0);
  await expect(page.getByText('帳目計算中，或沒有需要分帳的項目。')).toBeVisible();
  expect(state.queries.length).toBe(4);
});

test('failed history loading keeps observing mutations in the current cache', async ({ page }) => {
  const state = await fixture(page);
  state.failQuery = true;
  await history(page, true);
  await expect(page.getByRole('alert').filter({ hasText: '更新失敗' })).toBeVisible();
  await edit(page, 'Lunch', 'Dinner');
  await expect(page.getByRole('button', { name: '查看 Lunch', exact: true })).toHaveCount(0);
  expect(state.queries).toEqual([false, true]);
  state.failQuery = false;
  await page.getByRole('button', { name: '重試', exact: true }).click();
  await expect(page.locator('[data-record-id="r1"]').getByRole('img', { name: '舊版本' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 Dinner', exact: true })).toBeVisible();
  expect(state.queries).toEqual([false, true, true]);
});

test('history refresh waits for the active query and keeps foreground loading', async ({ page }) => {
  const state = await fixture(page);
  state.holdNextQuery = true;
  await page.clock.fastForward(40_000);
  await expect.poll(() => !!state.release).toBe(true);
  const oldResponse = state.release!;
  await history(page, true);
  expect(state.queries).toEqual([false, false]);
  await page.getByRole('button', { name: '分帳', exact: true }).click();
  const refresh = page.getByRole('button', { name: 'refresh money share' });
  await expect(refresh).toBeDisabled();
  // A skipped background tick must not clear the queued foreground loading state.
  await page.clock.fastForward(20_000);
  await expect(refresh).toBeDisabled();
  expect(state.queries).toEqual([false, false]);
  state.trip.name = 'Fresh after toggling';
  state.holdNextQuery = true;
  state.release = undefined;
  await oldResponse();
  await expect.poll(() => !!state.release).toBe(true);
  await expect(refresh).toBeDisabled();
  expect(state.queries).toEqual([false, false, true]);
  await state.release!();
  await expect(refresh).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Fresh after toggling', exact: true })).toBeVisible();
});

test('foreground refresh shares active polling and delays the next background request', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: '分帳', exact: true }).click();
  const refresh = page.getByRole('button', { name: 'refresh money share' });
  state.holdNextQuery = true;
  await refresh.click();
  await expect.poll(() => !!state.release).toBe(true);
  await page.clock.fastForward(20_000);
  expect(state.queries.length).toBe(2);
  await page.clock.fastForward(1000);
  await state.release!();
  await expect(refresh).toBeEnabled();
  await page.clock.fastForward(19_000);
  await page.clock.runFor(1);
  expect(state.queries.length).toBe(2);
  await page.clock.fastForward(20_000);
  await expect.poll(() => state.queries.length).toBe(3);
});

for (const mobile of [false, true]) {
  test(`statistics view uses server snapshots without extra queries (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.setViewportSize({ width: mobile ? 375 : 1280, height: 900 });
    const state = await fixture(page);
    await page.getByRole('button', { name: '分帳', exact: true }).click();
    await expect(page.getByRole('button', { name: '結算', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '成員統計', exact: true }).click();
    const panel = page.getByRole('region', { name: '成員統計資料' });
    const member = (name: string) => mobile ? panel.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) }) : panel.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
    await expect(member('Alice')).toContainText('$100.00');
    await expect(member('Bob')).toContainText('$0.00');
    expect(state.queries).toEqual([false]);
    state.trip.addresses = [{ ...alice, statistics: { totalExpense: 1234.5, totalPrepaid: 0, activeRecordCount: 0 } }, { ...bob, statistics: null }];
    state.trip.isValid = false;
    await page.clock.fastForward(40_000);
    await expect(member('Alice')).toContainText('$1,234.50');
    await expect(member('Bob')).toContainText('—');
    await expect(panel.getByRole('status')).toContainText('已略過無效帳目');
    expect(state.queries).toEqual([false, false]);
    await expect(page.getByRole('button', { name: '成員統計', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`statistics-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    state.trip.addresses = [];
    await page.getByRole('button', { name: 'refresh money share' }).click();
    await expect(panel.getByText('尚無成員')).toBeVisible();
    expect(state.queries.length).toBe(3);
    await page.getByRole('button', { name: '成員', exact: true }).click();
    await page.getByRole('button', { name: '分帳', exact: true }).click();
    await expect(page.getByRole('button', { name: '結算', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(state.queries.length).toBe(3);
  });
}
