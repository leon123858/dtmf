export type ID = string;

export enum RecordCategory {
	NORMAL = 'NORMAL', FIX = 'FIX', PART = 'PART',
	FIX_BEFORE_NORMAL = 'FIX_BEFORE_NORMAL', TRANSFER = 'TRANSFER',
}

export interface Address { id: ID; name: string }
export interface Record {
	id: ID; name: string; amount: number; prePayAddress: Address; time: string;
	shouldPayAddress: Address[]; extendPayMsg: number[];
	category: RecordCategory; isValid: boolean;
}
export interface Payment { amount: number; address: Address }
export interface Tx { input: Payment[]; output: Payment }
export interface Trip {
	id: ID; name: string; records: Record[]; moneyShare: Tx[];
	addresses: Address[]; isValid: boolean;
}
export interface NewRecordInput {
	name: string; amount: number; prePayAddressId: ID;
	shouldPayAddressIds: ID[]; time?: string; extendPayMsg?: number[];
	category?: RecordCategory;
}
export interface EditRecordInput { old: NewRecordInput; new: NewRecordInput }
export interface NewTripInput { name: string }
export interface NewAddressInput { name: string }

export interface TripQueryVariables { tripId: ID }
export interface TripQueryData { trip: Trip | null }
export interface CreateTripMutationVariables { input: NewTripInput }
export interface CreateTripMutationData { createTrip: Pick<Trip, 'id'> }
export interface UpdateTripMutationVariables { tripId: ID; input: NewTripInput }
export interface UpdateTripMutationData { updateTrip: Pick<Trip, 'id' | 'name'> }
export interface CreateRecordMutationVariables { tripId: ID; input: NewRecordInput }
export interface CreateRecordMutationData { createRecord: Record }
export interface UpdateRecordMutationVariables { recordId: ID; input: EditRecordInput }
export interface UpdateRecordMutationData { updateRecord: Record }
export interface RemoveRecordMutationVariables { recordId: ID }
export interface RemoveRecordMutationData { removeRecord: ID }
export interface CreateAddressMutationVariables { tripId: ID; input: NewAddressInput }
export interface CreateAddressMutationData { createAddress: Address }
export interface UpdateAddressMutationVariables { tripId: ID; addressId: ID; input: NewAddressInput }
export interface UpdateAddressMutationData { updateAddress: Address }
export interface DeleteAddressMutationVariables { tripId: ID; addressId: ID }
export interface DeleteAddressMutationData { deleteAddress: Address }

export interface SubRecordCreateSubscriptionVariables { tripId: ID }
export interface SubRecordCreateSubscriptionData { subRecordCreate: Record }
export interface SubRecordDeleteSubscriptionVariables { tripId: ID }
export interface SubRecordDeleteSubscriptionData { subRecordDelete: ID }
export interface SubRecordUpdateSubscriptionVariables { tripId: ID }
export interface SubRecordUpdateSubscriptionData { subRecordUpdate: Record }
export interface SubAddressCreateSubscriptionVariables { tripId: ID }
export interface SubAddressCreateSubscriptionData { subAddressCreate: Address }
export interface SubAddressUpdateSubscriptionVariables { tripId: ID }
export interface SubAddressUpdateSubscriptionData { subAddressUpdate: Address }
export interface SubAddressDeleteSubscriptionVariables { tripId: ID }
export interface SubAddressDeleteSubscriptionData { subAddressDelete: Address }

export interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[] }>;
}
