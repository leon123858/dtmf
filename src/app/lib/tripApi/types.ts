export type ID = string;

export enum RecordCategory {
	NORMAL = 'NORMAL', FIX = 'FIX', PART = 'PART',
	FIX_BEFORE_NORMAL = 'FIX_BEFORE_NORMAL', TRANSFER = 'TRANSFER',
}

export interface AddressSnapshot { id: ID; name: string; useNickname: boolean }
export interface TripSnapshot { id: ID; name: string; private: boolean }
export interface AddressStatistics {
 totalExpense: number; totalPrepaid: number; activeRecordCount: number;
}
// Statistics are selected only on the trip member list.
export interface BoundUser { userId: ID; userName: string | null }
export interface Address extends AddressSnapshot { bind?: BoundUser | null; statistics?: AddressStatistics | null }
export interface Record {
	id: ID; name: string; amount: number; prePayAddress: Address; time: string;
	shouldPayAddress: Address[]; extendPayMsg: number[];
	category: RecordCategory; isValid: boolean;
	parentRecordId?: ID | null; isDeleted: boolean; isActive: boolean;
}
export interface RecordPayload extends Omit<Record, 'name' | 'amount' | 'prePayAddress' | 'shouldPayAddress' | 'extendPayMsg'> {
 name: string | null; amount: number | null; prePayAddress: Address | null;
 shouldPayAddress: Address[] | null; extendPayMsg: number[] | null;
}
export interface RecordSnapshot extends Omit<RecordPayload, 'prePayAddress' | 'shouldPayAddress'> {
 prePayAddress: AddressSnapshot | null; shouldPayAddress: AddressSnapshot[] | null;
}
export interface TripPayload extends Omit<Trip, 'records'> { records: RecordPayload[] }
export interface Payment { amount: number; address: Address }
export interface Tx { input: Payment[]; output: Payment }
export interface Trip {
 users: BoundUser[];
	id: ID; name: string; private: boolean; records: Record[]; moneyShare: Tx[];
	addresses: Address[]; isValid: boolean;
}
export interface NewRecordInput {
	name: string; amount: number; prePayAddressId: ID;
	shouldPayAddressIds: ID[]; time?: string; extendPayMsg?: number[];
	category?: RecordCategory; isDeleted?: boolean;
}
export interface EditRecordInput { old?: NewRecordInput | null; new?: NewRecordInput | null }
export interface NewTripInput { name: string }
export interface NewAddressInput { name?: string | null; useNickname?: boolean | null }
export interface EditTripInput { name?: string | null; private?: boolean | null }

export interface TripQueryVariables { tripId: ID; haveHistory?: boolean }
export interface TripQueryData { trip: TripPayload | null }
export interface CreateTripMutationVariables { input: NewTripInput }
export interface CreateTripMutationData { createTrip: Pick<TripSnapshot, 'id'> }
export interface UpdateTripMutationVariables { tripId: ID; input: EditTripInput }
export interface UpdateTripMutationData { updateTrip: TripSnapshot }
export interface CreateRecordMutationVariables { tripId: ID; input: NewRecordInput }
export interface CreateRecordMutationData { createRecord: RecordSnapshot }
export interface UpdateRecordMutationVariables { recordId: ID; input: EditRecordInput }
export interface UpdateRecordMutationData { updateRecord: RecordSnapshot }
export interface CreateAddressMutationVariables { tripId: ID; input: NewAddressInput; bindToMe?: boolean }
export interface CreateAddressMutationData { createAddress: AddressSnapshot }
export interface UpdateAddressMutationVariables { tripId: ID; addressId: ID; input: NewAddressInput }
export interface UpdateAddressMutationData { updateAddress: AddressSnapshot }
export interface DeleteAddressMutationVariables { tripId: ID; addressId: ID }
export interface DeleteAddressMutationData { deleteAddress: AddressSnapshot }

export interface SubRecordCreateSubscriptionVariables { tripId: ID }
export interface SubRecordCreateSubscriptionData { subRecordCreate: RecordSnapshot }
export interface SubRecordUpdateSubscriptionVariables { tripId: ID }
export interface SubRecordUpdateSubscriptionData { subRecordUpdate: RecordSnapshot }
export interface SubAddressCreateSubscriptionVariables { tripId: ID }
export interface SubAddressCreateSubscriptionData { subAddressCreate: AddressSnapshot }
export interface SubAddressUpdateSubscriptionVariables { tripId: ID }
export interface SubAddressUpdateSubscriptionData { subAddressUpdate: AddressSnapshot }
export interface SubAddressDeleteSubscriptionVariables { tripId: ID }
export interface SubAddressDeleteSubscriptionData { subAddressDelete: AddressSnapshot }

export interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: string[]; extensions?: { code?: string } }>;
}
