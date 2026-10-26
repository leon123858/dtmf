'use server';

import { TripApiError } from '../tripApi/public';
import { createServerTripApi } from '../tripApi/http';

const ERROR_MESSAGE = '創建新旅程失敗，請稍後再試。';

type CreateTripResult = { error: string; unauthenticated?: boolean; tripId?: never } | { tripId: string; error?: never; unauthenticated?: never };

export async function createTripAction(formData: FormData, token?: string): Promise<CreateTripResult> {
	const tripName = formData.get('tripName');
	if (typeof tripName !== 'string' || tripName.trim() === '') {
		return { error: '旅程名稱不能為空。' };
	}

	try {
		const result = await createServerTripApi(token).createTrip({ name: tripName.trim() });
		if (!result?.id) {
			console.error('創建新旅程時缺少旅程 ID');
			return { error: ERROR_MESSAGE };
		}
		return { tripId: result.id };
	} catch (error) {
		if (error instanceof TripApiError && error.code === 'unauthenticated') return { error: '登入已失效，請重新登入。', unauthenticated: true };
		return { error: error instanceof TripApiError && error.code === 'unavailable' ? error.message : ERROR_MESSAGE };
	}
}
