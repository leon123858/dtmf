'use server'; // 標記為 Server Action 檔案

import { redirect } from 'next/navigation';
import { createTripHttp } from '../tripApi/http';
import { CreateTripMutationData, NewTripInput } from '../tripApi/types';

const ERROR_MESSAGE = '創建新旅程失敗，請稍後再試。';

export async function createTripAction(formData: FormData) {
	// 從表單數據中獲取 tripName
	const tripName = formData.get('tripName');

	if (!tripName || typeof tripName !== 'string' || tripName.trim() === '') {
		throw new Error('旅程名稱不能為空。');
	}

	let ret: CreateTripMutationData;

	try {
		ret = await createTripHttp({
			name: tripName.trim(),
		} as NewTripInput);

		if (!ret || !ret.createTrip || !ret.createTrip.id) {
			throw new Error('創建新旅程失敗，請稍後再試。');
		}
	} catch (error) {
		console.error('創建新旅程時出錯:', error);
		if (error && error instanceof Error) {
			redirect(`/err?errMsg=${encodeURIComponent(error.message)}`);
		} else {
			redirect(`/err?errMsg=${encodeURIComponent(ERROR_MESSAGE)}`);
		}
	}

	redirect(`/trip/${ret.createTrip.id}`);
}
