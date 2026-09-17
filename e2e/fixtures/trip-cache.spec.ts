import { test, expect, type Page, type Route } from '@playwright/test';
import type { TripPayload, RecordPayload, NewRecordInput } from '../../src/app/lib/tripApi/types';
import { RecordCategory } from '../../src/app/lib/tripApi/types';

const alice = { __typename: 'Address', id: 'alice', name: 'Alice' };
const bob = { __typename: 'Address', id: 'bob', name: 'Bob' };
const initialRecord = {
  __typename: 'Record', id: 'r1', name: 'Lunch', amount: 100, prePayAddress: alice,
  shouldPayAddress: [alice, bob], extendPayMsg: [50, 50], category: RecordCategory.NORMAL,
  time: '1789056000000', isValid: true, isDeleted: false, isActive: true, parentRecordId: null,
};

async function fixture(page: Page) {
  await page.clock.install();
  const state = {
    queries: [] as boolean[], mutations: [] as string[], failQuery: false, failMutation: false,
    holdNextQuery: false, release: undefined as (() => Promise<void>) | undefined,
    trip: {
      __typename: 'Trip', id: 'cache-probe', name: 'Cache probe', records: [initialRecord] as RecordPayload[],
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
      value = record;
      field = operationName === 'CreateRecord' ? 'createRecord' : 'updateRecord';
    } else if (operationName === 'CreateAddress') {
      const address = { __typename: 'Address', id: 'guest', name: variables.input.name };
      state.trip.addresses.push(address);
      value = address;
      field = 'createAddress';
    } else if (operationName === 'UpdateAddress') {
      const updated = { __typename: 'Address', id: variables.addressId, name: variables.input.name };
      state.trip.addresses = state.trip.addresses.map(address => address.id === updated.id ? updated : address);
      value = updated;
      field = 'updateAddress';
    } else if (operationName === 'DeleteAddress') {
      value = state.trip.addresses.find(address => address.id === variables.addressId)!;
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
  await page.getByRole('switch', { name: 'Record history', exact: true }).setChecked(enabled);
  await page.getByRole('button', { name: 'Close menu', exact: true }).click();
}
async function edit(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: `編輯 ${from}`, exact: true }).click();
  await page.getByLabel('項目名稱', { exact: true }).fill(to);
  await page.getByRole('button', { name: '儲存變更', exact: true }).click();
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `查看 ${to}`, exact: true })).toBeVisible();
}

test('one initial query and one poll per interval, regardless of mounted readers', async ({ page }) => {
  const state = await fixture(page);
  for (const tab of ['分帳', '成員', '記帳', '帳目', '分帳', '成員', '帳目']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
  }
  expect(state.queries).toEqual([false]);
  for (let count = 2; count <= 3; count++) {
    await page.clock.fastForward(20_000);
    await expect.poll(() => state.queries.length).toBe(count);
  }
  await history(page, true);
  await expect.poll(() => state.queries).toEqual([false, false, false, true]);
  await page.clock.fastForward(20_000);
  await expect.poll(() => state.queries).toEqual([false, false, false, true, true]);
  await history(page, false);
  await expect.poll(() => state.queries.length).toBe(6);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: '首頁', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.clock.fastForward(60_000);
  expect(state.queries.length).toBe(6);
});

test('create, edit, delete and member mutations update UI without trip queries', async ({ page }) => {
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
  await page.getByText('Guest', { exact: true }).locator('..').getByRole('button', { name: '改名' }).click();
  await page.getByRole('textbox', { name: '修改 Guest 的名稱' }).fill('Visitor');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByText('Visitor', { exact: true })).toBeVisible();
  await page.getByText('Visitor', { exact: true }).locator('..').getByRole('button', { name: '移除' }).click();
  await expect(page.getByText('Visitor', { exact: true })).toHaveCount(0);
  expect(state.mutations).toEqual(['CreateRecord', 'UpdateRecord', 'UpdateRecord', 'CreateAddress', 'UpdateAddress', 'DeleteAddress']);
  expect(state.queries).toEqual([false]);
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

test('slow polling never rolls back a successful edit and does not delay saving', async ({ page }) => {
  const state = await fixture(page);
  state.holdNextQuery = true;
  await page.clock.fastForward(20_000);
  await expect.poll(() => !!state.release).toBe(true);
  await edit(page, 'Lunch', 'Dinner');
  expect(state.queries.length).toBe(2);
  await state.release!();
  await page.getByRole('button', { name: '分帳', exact: true }).click();
  await expect(page.getByRole('button', { name: 'refresh money share' })).toBeEnabled();
  await page.getByRole('button', { name: '帳目', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 Dinner', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 Lunch', exact: true })).toHaveCount(0);
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
  await page.clock.fastForward(20_000);
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

test('rapid history toggles keep the newest request loading when an old response finishes', async ({ page }) => {
  const state = await fixture(page);
  state.holdNextQuery = true;
  await page.clock.fastForward(20_000);
  await expect.poll(() => !!state.release).toBe(true);
  const oldResponse = state.release!;
  await history(page, true);
  await expect.poll(() => state.queries.length).toBe(3);
  await page.getByRole('button', { name: '分帳', exact: true }).click();
  const refresh = page.getByRole('button', { name: 'refresh money share' });
  await expect(refresh).toBeEnabled();
  state.trip.name = 'Fresh after toggling';
  state.holdNextQuery = true;
  state.release = undefined;
  await history(page, false);
  await expect.poll(() => state.queries.length).toBe(4);
  await expect.poll(() => !!state.release).toBe(true);
  await expect(refresh).toBeDisabled();
  await oldResponse();
  // Let Apollo and React process the old response; the newer query is still held.
  await page.clock.runFor(100);
  await expect(refresh).toBeDisabled();
  await state.release!();
  await expect(refresh).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Fresh after toggling', exact: true })).toBeVisible();
  expect(state.queries).toEqual([false, false, true, false]);
});
