// app/lib/data.ts
import { Trip } from './types';

// Simulates a simple database of trips.
export const MOCK_TRIP_STORE: { [key: string]: Trip } = {
	'trip-123': {
		id: 'trip-123',
		name: '東京五日遊',
		addressList: ['0xAlice', '0xBob', '0xCarol'],
		records: [
			{
				id: 'rec-1',
				name: '機票',
				amount: 25000,
				prePayAddress: '0xAlice',
				shouldPayAddress: ['0xAlice', '0xBob', '0xCarol'],
			},
			{
				id: 'rec-2',
				name: '旅館',
				amount: 45000,
				prePayAddress: '0xBob',
				shouldPayAddress: ['0xAlice', '0xBob', '0xCarol'],
			},
			{
				id: 'rec-3',
				name: '迪士尼門票',
				amount: 7500,
				prePayAddress: '0xCarol',
				shouldPayAddress: ['0xBob', '0xCarol'],
			},
			{
				id: 'rec-4',
				name: '晚餐',
				amount: 3000,
				prePayAddress: '0xAlice',
				shouldPayAddress: ['0xAlice', '0xBob'],
			},
		],
		moneyShare: [
			{
				input: [{ amount: 14166.67, address: '0xBob' }],
				output: { amount: 14166.67, address: '0xAlice' },
			},
			{
				input: [{ amount: 3750, address: '0xBob' }],
				output: { amount: 3750, address: '0xCarol' },
			},
		],
	},
};

// --- Helper Functions ---
export const hexToSimple = (hex: string) =>
	hex ? hex.substring(0, 5) + '...' : '';
