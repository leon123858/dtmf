'use server';

import { ApolloError } from '@apollo/client';
import { createTripHttp } from '../tripApi/http';

const ERROR_MESSAGE = '創建新旅程失敗，請稍後再試。';

type CreateTripResult = { error: string; tripId?: never } | { tripId: string; error?: never };

export async function createTripAction(formData: FormData): Promise<CreateTripResult> {
	const tripName = formData.get('tripName');
	if (typeof tripName !== 'string' || tripName.trim() === '') {
		return { error: '旅程名稱不能為空。' };
	}

	try {
		const result = await createTripHttp({ name: tripName.trim() });
		if (!result?.createTrip?.id) {
			console.error('創建新旅程時缺少旅程 ID');
			return { error: ERROR_MESSAGE };
		}
		return { tripId: result.createTrip.id };
	} catch (error) {
		console.error('創建新旅程時出錯:', error);
		const message = error instanceof ApolloError && !error.networkError
			? error.graphQLErrors.map(item => item.message).filter(Boolean).join('\n')
			: '';
		return { error: message || ERROR_MESSAGE };
	}
}
