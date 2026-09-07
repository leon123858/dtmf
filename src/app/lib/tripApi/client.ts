import { useMemo } from 'react';
import { normalizeTrip } from './recordInput';
import { refreshTrip } from './sync';
import {
	useQuery,
 useApolloClient,
 OperationVariables,
 DocumentNode,
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
	CREATE_ADDRESS,
	UPDATE_ADDRESS,
	DELETE_ADDRESS,
} from './mutation';
import {
	SUB_RECORD_CREATE,
	SUB_RECORD_UPDATE,
	SUB_ADDRESS_CREATE,
	SUB_ADDRESS_UPDATE,
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
	CreateAddressMutationVariables,
	CreateAddressMutationData,
	UpdateAddressMutationVariables,
	UpdateAddressMutationData,
	DeleteAddressMutationVariables,
	DeleteAddressMutationData,
	SubRecordCreateSubscriptionVariables,
	SubRecordCreateSubscriptionData,
	SubRecordUpdateSubscriptionVariables,
	SubRecordUpdateSubscriptionData,
	SubAddressCreateSubscriptionVariables,
	SubAddressCreateSubscriptionData,
	SubAddressUpdateSubscriptionVariables,
	SubAddressUpdateSubscriptionData,
	SubAddressDeleteSubscriptionVariables,
	SubAddressDeleteSubscriptionData,
} from './types';

// Define an object type containing all GraphQL operations
interface TripGraphQLClient {
	queries: {
		useTrip: (tripId: ID, haveHistory?: boolean) => {
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
		useCreateAddress: (
			tripId: ID
		) => MutationTuple<
			CreateAddressMutationData,
			CreateAddressMutationVariables
		>;
		useUpdateAddress: (
			tripId: ID
		) => MutationTuple<UpdateAddressMutationData, UpdateAddressMutationVariables>;
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
		useSubRecordUpdate: (
			tripId: ID
		) => SubscriptionResult<SubRecordUpdateSubscriptionData>;
		useSubAddressCreate: (
			tripId: ID
		) => SubscriptionResult<SubAddressCreateSubscriptionData>;
		useSubAddressUpdate: (
			tripId: ID
		) => SubscriptionResult<SubAddressUpdateSubscriptionData>;
		useSubAddressDelete: (
			tripId: ID
		) => SubscriptionResult<SubAddressDeleteSubscriptionData>;
	};
}

export const useGraphQLClient = (): TripGraphQLClient => {
	return {
		queries: {
			useTrip: (tripId: ID, haveHistory: boolean = false) => {
				const { loading, error, data, refetch } = useQuery<
					TripQueryData,
					TripQueryVariables
				>(GET_TRIP, {
					variables: { tripId, haveHistory },
					fetchPolicy: 'cache-first',
 skip: !tripId,
 notifyOnNetworkStatusChange: true,
					pollInterval: 20000, // Refetch data every 20 seconds
				});
				const trip = useMemo(() => data?.trip ? normalizeTrip(data.trip) : (data?.trip === null ? null : undefined), [data]);
 return { data: trip, loading, error, refetch };
			},
		},
		mutations: {
			useCreateTrip: () =>
				useMutation<CreateTripMutationData, CreateTripMutationVariables>(
					CREATE_TRIP
				),
			useUpdateTrip: () =>
				useTripMutation<UpdateTripMutationData, UpdateTripMutationVariables>(
					UPDATE_TRIP
				),
			useCreateRecord: (tripId: ID) => useTripMutation<CreateRecordMutationData, CreateRecordMutationVariables>(CREATE_RECORD, tripId),
			useUpdateRecord: (tripId: ID) => useTripMutation<UpdateRecordMutationData, UpdateRecordMutationVariables>(UPDATE_RECORD, tripId),
			useCreateAddress: (tripId: ID) => useTripMutation<CreateAddressMutationData, CreateAddressMutationVariables>(CREATE_ADDRESS, tripId),
			useUpdateAddress: (tripId: ID) => useTripMutation<UpdateAddressMutationData, UpdateAddressMutationVariables>(UPDATE_ADDRESS, tripId),
			useDeleteAddress: (tripId: ID) => useTripMutation<DeleteAddressMutationData, DeleteAddressMutationVariables>(DELETE_ADDRESS, tripId),
		},
		subscriptions: {
			useSubRecordCreate: (tripId: ID) =>
				useSubscription<
					SubRecordCreateSubscriptionData,
					SubRecordCreateSubscriptionVariables
				>(SUB_RECORD_CREATE, {
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
			useSubAddressUpdate: (tripId: ID) =>
				useSubscription<
					SubAddressUpdateSubscriptionData,
					SubAddressUpdateSubscriptionVariables
				>(SUB_ADDRESS_UPDATE, {
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

function useTripMutation<T, V extends OperationVariables>(document: DocumentNode, tripId?: string): MutationTuple<T, V> {
 const client = useApolloClient();
 const [mutate, result] = useMutation<T, V>(document, { fetchPolicy: 'no-cache' });
 const execute: MutationTuple<T, V>[0] = async options => {
  const response = await mutate(options);
  if (!response.errors?.length && response.data) {
   const id = tripId ?? options?.variables?.tripId;
   if (typeof id === 'string') await refreshTrip(client, id);
  }
  return response;
 };
 return [execute, result];
}
