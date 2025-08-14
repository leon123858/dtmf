export type ID = string; // GraphQL ID 通常是字符串

export enum RecordCategory {
	NORMAL = 'NORMAL',
	FIX = 'FIX',
}

export interface Record {
	id: ID;
	name: string;
	amount: number; // Float 對應 number
	prePayAddress: string;
	time: string; // ISO 格式的時間字符串
	shouldPayAddress: string[];
	extendPayMsg: number[];
	category: RecordCategory;
	isValid: boolean;
}

export interface Payment {
	amount: number;
	address: string;
}

export interface Tx {
	input: Payment[];
	output: Payment;
}

export interface Trip {
	id: ID;
	name: string;
	records: Record[];
	moneyShare: Tx[];
	addressList: string[];
	isValid: boolean;
}

export interface NewRecordInput {
	name: string;
	amount: number;
	prePayAddress: string;
	shouldPayAddress: string[];
	time?: string;
	extendPayMsg?: number[];
	category?: RecordCategory;
}

export interface NewTripInput {
	name: string;
}

// 查詢 (Query) 的返回類型
export interface TripQueryVariables {
	tripId: ID;
}

export interface TripQueryData {
	trip: Trip | null; // trip 可能為 null
}

// Mutation 的返回類型和變數類型
export interface CreateTripMutationVariables {
	input: NewTripInput;
}

export interface CreateTripMutationData {
	createTrip: Trip;
}

export interface UpdateTripMutationVariables {
	tripId: ID;
	input: NewTripInput;
}

export interface UpdateTripMutationData {
	updateTrip: Trip;
}

export interface CreateRecordMutationVariables {
	tripId: ID;
	input: NewRecordInput;
}

export interface CreateRecordMutationData {
	createRecord: Record;
}

export interface UpdateRecordMutationVariables {
	recordId: ID;
	input: NewRecordInput;
}

export interface UpdateRecordMutationData {
	updateRecord: Record;
}

export interface RemoveRecordMutationVariables {
	recordId: ID;
}

export interface RemoveRecordMutationData {
	removeRecord: ID; // 返回被移除的 ID
}

export interface CreateAddressMutationVariables {
	tripId: ID;
	address: string;
}

export interface CreateAddressMutationData {
	createAddress: string; // 返回新增的地址
}

export interface DeleteAddressMutationVariables {
	tripId: ID;
	address: string;
}

export interface DeleteAddressMutationData {
	deleteAddress: string; // 返回被刪除的地址
}

// Subscription 的返回類型和變數類型
export interface SubRecordCreateSubscriptionVariables {
	tripId: ID;
}

export interface SubRecordCreateSubscriptionData {
	subRecordCreate: Record;
}

export interface SubRecordDeleteSubscriptionVariables {
	tripId: ID;
}

export interface SubRecordDeleteSubscriptionData {
	subRecordDelete: ID;
}

export interface SubRecordUpdateSubscriptionVariables {
	tripId: ID;
}

export interface SubRecordUpdateSubscriptionData {
	subRecordUpdate: Record;
}

export interface SubAddressCreateSubscriptionVariables {
	tripId: ID;
}

export interface SubAddressCreateSubscriptionData {
	subAddressCreate: string;
}

export interface SubAddressDeleteSubscriptionVariables {
	tripId: ID;
}

export interface SubAddressDeleteSubscriptionData {
	subAddressDelete: string;
}

// GraphQL 響應的通用結構
export interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{
		message: string;
		locations?: Array<{ line: number; column: number }>;
		path?: string[];
	}>;
}
