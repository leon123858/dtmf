'use server'; // 標記為 Server Action 檔案

import { redirect } from 'next/navigation';
import { createTripHttp } from '../tripApi/http';
import { NewTripInput } from '../tripApi/types';

export async function createTripAction(formData: FormData) {
	// 從表單數據中獲取 tripName
	const tripName = formData.get('tripName');

	if (!tripName || typeof tripName !== 'string' || tripName.trim() === '') {
		throw new Error('旅程名稱不能為空。');
	}

	const ret = await createTripHttp({
		name: tripName.trim(),
	} as NewTripInput);

	if (!ret || !ret.createTrip || !ret.createTrip.id) {
		throw new Error('無法創建新旅程。');
	}

	redirect(`/trip/${ret.createTrip.id}`);
}
