import {
	CreateTripMutationData,
	NewTripInput, // 導入 NewTripInput
} from './types';
import { CREATE_TRIP } from './mutation'; // 導入 GraphQL mutation 字串
import { getClient } from './baseClient';

/**
 * 封裝 CREATE_TRIP mutation 的函數
 * @param input - NewTripInput 物件
 * @param token - (可選) 用於身份驗證的 token
 * @returns Promise<CreateTripMutationData>
 */
export async function createTripHttp(
	input: NewTripInput
	// token?: string
): Promise<CreateTripMutationData> {
	const ret = await getClient().mutate({
		mutation: CREATE_TRIP,
		variables: { input },
	});

	return ret.data;
}
