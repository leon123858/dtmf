// src/services/graphqlHttpClient.ts

import {
	CreateTripMutationVariables,
	CreateTripMutationData,
	GraphQLResponse,
	NewTripInput, // 導入 NewTripInput
} from './types';
import { CREATE_TRIP } from './mutation'; // 導入 GraphQL mutation 字串

// 你的 GraphQL 後端 URI
const GRAPHQL_API_URL = 'http://localhost:8080/query'; // 請替換成你的 GraphQL 後端 URI

interface GraphQLRequestOptions<TVariables> {
	query: string; // GraphQL 查詢或 mutation 字串
	variables?: TVariables; // 變數物件
	headers?: Record<string, string>; // 自定義 HTTP 頭部
}

/**
 * 通用的 GraphQL HTTP 請求函數
 * @param options - 請求選項，包含 query, variables 和 headers
 * @returns Promise<TData> 或拋出錯誤
 */
async function graphqlRequest<TData, TVariables>(
	options: GraphQLRequestOptions<TVariables>
): Promise<TData> {
	const { query, variables, headers } = options;

	try {
		const response = await fetch(GRAPHQL_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...headers, // 合併自定義頭部
			},
			body: JSON.stringify({
				query: query, // GraphQL 查詢字串
				variables: variables, // 變數物件
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`HTTP error! status: ${response.status}, message: ${errorText}`
			);
		}

		const result: GraphQLResponse<TData> = await response.json();

		if (result.errors) {
			// 處理 GraphQL 錯誤
			const errorMessages = result.errors.map((err) => err.message).join(', ');
			throw new Error(`GraphQL errors: ${errorMessages}`);
		}

		if (!result.data) {
			throw new Error('No data returned from GraphQL response.');
		}

		return result.data;
	} catch (error) {
		console.error('GraphQL request failed:', error);
		throw error; // 重新拋出錯誤以便調用者處理
	}
}

/**
 * 封裝 CREATE_TRIP mutation 的函數
 * @param input - NewTripInput 物件
 * @param token - (可選) 用於身份驗證的 token
 * @returns Promise<CreateTripMutationData>
 */
export async function createTripHttp(
	input: NewTripInput,
	token?: string
): Promise<CreateTripMutationData> {
	const variables: CreateTripMutationVariables = { input };
	const headers: Record<string, string> = {};

	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	// CREATE_TRIP.loc.source.body 獲取純 GraphQL 字串
	// 或者如果你直接定義為 string，則直接使用 CREATE_TRIP
	const query = CREATE_TRIP.loc?.source.body || CREATE_TRIP.toString();

	return graphqlRequest<CreateTripMutationData, CreateTripMutationVariables>({
		query: query,
		variables: variables,
		headers: headers,
	});
}
