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
		useCreateRecord: () => MutationTuple<
			CreateRecordMutationData,
			CreateRecordMutationVariables
		>;
		useUpdateRecord: () => MutationTuple<
			UpdateRecordMutationData,
			UpdateRecordMutationVariables
		>;
		useRemoveRecord: () => MutationTuple<
			RemoveRecordMutationData,
			RemoveRecordMutationVariables
		>;
		useCreateAddress: () => MutationTuple<
			CreateAddressMutationData,
			CreateAddressMutationVariables
		>;
		useDeleteAddress: () => MutationTuple<
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
			useCreateRecord: () =>
				useMutation<CreateRecordMutationData, CreateRecordMutationVariables>(
					CREATE_RECORD
				),
			useUpdateRecord: () =>
				useMutation<UpdateRecordMutationData, UpdateRecordMutationVariables>(
					UPDATE_RECORD
				),
			useRemoveRecord: () =>
				useMutation<RemoveRecordMutationData, RemoveRecordMutationVariables>(
					REMOVE_RECORD
				),
			useCreateAddress: () =>
				useMutation<CreateAddressMutationData, CreateAddressMutationVariables>(
					CREATE_ADDRESS
				),
			useDeleteAddress: () =>
				useMutation<DeleteAddressMutationData, DeleteAddressMutationVariables>(
					DELETE_ADDRESS
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
