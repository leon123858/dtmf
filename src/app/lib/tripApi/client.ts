import {
	useQuery,
	useMutation,
	useSubscription,
	ApolloQueryResult,
	MutationTuple,
	SubscriptionResult,
} from '@apollo/client';
import { GET_TRIP } from './query';
import {
	CREATE_TRIP,
	UPDATE_TRIP,
	CREATE_RECORD,
	UPDATE_RECORD,
	REMOVE_RECORD,
	CREATE_ADDRESS,
	DELETE_ADDRESS,
} from './mutation';
import {
	SUB_RECORD_CREATE,
	SUB_RECORD_DELETE,
	SUB_RECORD_UPDATE,
	SUB_ADDRESS_CREATE,
	SUB_ADDRESS_DELETE,
} from './subscription';
import {
	ID,
	Trip,
	TripQueryVariables,
	TripQueryData,
	CreateTripMutationVariables,
	CreateTripMutationData,
	UpdateTripMutationVariables,
	UpdateTripMutationData,
	CreateRecordMutationVariables,
	CreateRecordMutationData,
	UpdateRecordMutationVariables,
	UpdateRecordMutationData,
	RemoveRecordMutationVariables,
	RemoveRecordMutationData,
	CreateAddressMutationVariables,
	CreateAddressMutationData,
	DeleteAddressMutationVariables,
	DeleteAddressMutationData,
	SubRecordCreateSubscriptionVariables,
	SubRecordCreateSubscriptionData,
	SubRecordDeleteSubscriptionVariables,
	SubRecordDeleteSubscriptionData,
	SubRecordUpdateSubscriptionVariables,
	SubRecordUpdateSubscriptionData,
	SubAddressCreateSubscriptionVariables,
	SubAddressCreateSubscriptionData,
	SubAddressDeleteSubscriptionVariables,
	SubAddressDeleteSubscriptionData,
} from './types';

// 定義一個包含所有 GraphQL 操作的物件類型
interface TripGraphQLClient {
	queries: {
		useTrip: (tripId: ID) => {
			data: Trip | null | undefined;
			loading: boolean;
			error: ApolloQueryResult<TripQueryData>['error'];
			refetch: (
				variables?: Partial<TripQueryVariables> | undefined
			) => Promise<ApolloQueryResult<TripQueryData>>;
		};
	};
	mutations: {
		useCreateTrip: () => MutationTuple<
			CreateTripMutationData,
			CreateTripMutationVariables
		>;
		useUpdateTrip: () => MutationTuple<
			UpdateTripMutationData,
			UpdateTripMutationVariables
		>;
		useCreateRecord: (
			tripId: ID
		) => MutationTuple<CreateRecordMutationData, CreateRecordMutationVariables>;
		useUpdateRecord: (
			tripId: ID
		) => MutationTuple<UpdateRecordMutationData, UpdateRecordMutationVariables>;
		useRemoveRecord: (
			tripId: ID
		) => MutationTuple<RemoveRecordMutationData, RemoveRecordMutationVariables>;
		useCreateAddress: (
			tripId: ID
		) => MutationTuple<
			CreateAddressMutationData,
			CreateAddressMutationVariables
		>;
		useDeleteAddress: (
			tripId: ID
		) => MutationTuple<
			DeleteAddressMutationData,
			DeleteAddressMutationVariables
		>;
	};
	subscriptions: {
		useSubRecordCreate: (
			tripId: ID
		) => SubscriptionResult<SubRecordCreateSubscriptionData>;
		useSubRecordDelete: (
			tripId: ID
		) => SubscriptionResult<SubRecordDeleteSubscriptionData>;
		useSubRecordUpdate: (
			tripId: ID
		) => SubscriptionResult<SubRecordUpdateSubscriptionData>;
		useSubAddressCreate: (
			tripId: ID
		) => SubscriptionResult<SubAddressCreateSubscriptionData>;
		useSubAddressDelete: (
			tripId: ID
		) => SubscriptionResult<SubAddressDeleteSubscriptionData>;
	};
}

export const useGraphQLClient = (): TripGraphQLClient => {
	return {
		queries: {
			useTrip: (tripId: ID) => {
				const { loading, error, data, refetch } = useQuery<
					TripQueryData,
					TripQueryVariables
				>(GET_TRIP, {
					variables: { tripId },
					fetchPolicy: 'cache-first',
					pollInterval: 20000, // 每20秒重新拉取一次數據
				});
				return { data: data?.trip, loading, error, refetch };
			},
		},
		mutations: {
			useCreateTrip: () =>
				useMutation<CreateTripMutationData, CreateTripMutationVariables>(
					CREATE_TRIP
				),
			useUpdateTrip: () =>
				useMutation<UpdateTripMutationData, UpdateTripMutationVariables>(
					UPDATE_TRIP
				),
			useCreateRecord: (tripId: ID) =>
				useMutation<CreateRecordMutationData, CreateRecordMutationVariables>(
					CREATE_RECORD,
					{
						update: (cache, { data }) => {
							// 更新 Apollo Cache 中的記錄列表
							const existingTrip = cache.readQuery<TripQueryData>({
								query: GET_TRIP,
								variables: { tripId },
							});
							if (existingTrip && data?.createRecord) {
								const curRecordList = existingTrip.trip?.records || [];
								if (
									curRecordList.some(
										(record) => record.id === data.createRecord.id
									)
								) {
									// 如果記錄已存在，則不進行更新
									return;
								}
								const updatedTrip = {
									...existingTrip,
									trip: {
										...existingTrip.trip,
										records: [
											...(existingTrip.trip?.records || []),
											data.createRecord,
										],
									},
								};
								cache.writeQuery({
									query: GET_TRIP,
									variables: { tripId },
									data: updatedTrip,
								});
							}
						},
					}
				),
			useUpdateRecord: (tripId: ID) =>
				useMutation<UpdateRecordMutationData, UpdateRecordMutationVariables>(
					UPDATE_RECORD,
					{
						update: (cache, { data }) => {
							// 更新 Apollo Cache 中的記錄列表
							const existingTrip = cache.readQuery<TripQueryData>({
								query: GET_TRIP,
								variables: { tripId },
							});
							if (existingTrip && data?.updateRecord) {
								const curRecordList = existingTrip.trip?.records || [];
								const curRecordIdx = curRecordList.findIndex(
									(record) => record.id === data.updateRecord.id
								);
								if (curRecordIdx === -1) {
									// 如果找不到要更新的記錄，則不進行更新
									return;
								}
								const updatedTrip = {
									...existingTrip,
									trip: {
										...existingTrip.trip,
										records: existingTrip.trip?.records.map((record) =>
											record.id === data.updateRecord.id
												? data.updateRecord
												: record
										),
									},
								};
								cache.writeQuery({
									query: GET_TRIP,
									variables: { tripId },
									data: updatedTrip,
								});
							}
						},
					}
				),
			useRemoveRecord: (tripId: ID) =>
				useMutation<RemoveRecordMutationData, RemoveRecordMutationVariables>(
					REMOVE_RECORD,
					{
						update: (cache, { data }) => {
							// 更新 Apollo Cache 中的記錄列表
							const existingTrip = cache.readQuery<TripQueryData>({
								query: GET_TRIP,
								variables: { tripId },
							});
							if (existingTrip && data?.removeRecord) {
								const updatedRecordList = existingTrip.trip?.records.filter(
									(record) => record.id !== data.removeRecord
								);
								const updatedTrip = {
									...existingTrip,
									trip: {
										...existingTrip.trip,
										records: updatedRecordList || [],
									},
								};
								cache.writeQuery({
									query: GET_TRIP,
									variables: { tripId },
									data: updatedTrip,
								});
							}
						},
					}
				),
			useCreateAddress: (tripId: ID) =>
				useMutation<CreateAddressMutationData, CreateAddressMutationVariables>(
					CREATE_ADDRESS,
					{
						update: (cache, { data }) => {
							// 更新 Apollo Cache 中的地址列表
							const existingTrip = cache.readQuery<TripQueryData>({
								query: GET_TRIP,
								variables: { tripId },
							});
							if (existingTrip && data?.createAddress) {
								const curAddressList = existingTrip.trip?.addressList || [];
								if (curAddressList.includes(data.createAddress)) {
									// 如果地址已存在，則不進行更新
									return;
								}
								const updatedTrip = {
									...existingTrip,
									trip: {
										...existingTrip.trip,
										addressList: [...curAddressList, data.createAddress],
									},
								};
								cache.writeQuery({
									query: GET_TRIP,
									variables: { tripId },
									data: updatedTrip,
								});
							}
						},
					}
				),
			useDeleteAddress: (tripId: ID) =>
				useMutation<DeleteAddressMutationData, DeleteAddressMutationVariables>(
					DELETE_ADDRESS,
					{
						update: (cache, { data }) => {
							// 更新 Apollo Cache 中的地址列表
							const existingTrip = cache.readQuery<TripQueryData>({
								query: GET_TRIP,
								variables: { tripId },
							});
							if (existingTrip && data?.deleteAddress) {
								const updatedAddressList =
									existingTrip.trip?.addressList.filter(
										(address) => address !== data.deleteAddress
									);
								const updatedTrip = {
									...existingTrip,
									trip: {
										...existingTrip.trip,
										addressList: updatedAddressList || [],
									},
								};
								cache.writeQuery({
									query: GET_TRIP,
									variables: { tripId },
									data: updatedTrip,
								});
							}
						},
					}
				),
		},
		subscriptions: {
			useSubRecordCreate: (tripId: ID) =>
				useSubscription<
					SubRecordCreateSubscriptionData,
					SubRecordCreateSubscriptionVariables
				>(SUB_RECORD_CREATE, {
					variables: { tripId },
				}),
			useSubRecordDelete: (tripId: ID) =>
				useSubscription<
					SubRecordDeleteSubscriptionData,
					SubRecordDeleteSubscriptionVariables
				>(SUB_RECORD_DELETE, {
					variables: { tripId },
				}),
			useSubRecordUpdate: (tripId: ID) =>
				useSubscription<
					SubRecordUpdateSubscriptionData,
					SubRecordUpdateSubscriptionVariables
				>(SUB_RECORD_UPDATE, {
					variables: { tripId },
				}),
			useSubAddressCreate: (tripId: ID) =>
				useSubscription<
					SubAddressCreateSubscriptionData,
					SubAddressCreateSubscriptionVariables
				>(SUB_ADDRESS_CREATE, {
					variables: { tripId },
				}),
			useSubAddressDelete: (tripId: ID) =>
				useSubscription<
					SubAddressDeleteSubscriptionData,
					SubAddressDeleteSubscriptionVariables
				>(SUB_ADDRESS_DELETE, {
					variables: { tripId },
				}),
		},
	};
};
