import { useContext, useMemo } from 'react';
import { SingleTripContext, TripState } from '@/app/context/SingleTripProvider';
import { updateTripCache, TripChange } from './cache';
import {
	useApolloClient,
	OperationVariables,
	DocumentNode,
	useMutation,
	useSubscription,
	MutationTuple,
	SubscriptionResult,
} from '@apollo/client';
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
		useTrip: (tripId: ID, haveHistory?: boolean) => TripState;
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
				const context = useContext(SingleTripContext);
				const data = context?.trip.data;
				const trip = useMemo(() => !data || haveHistory ? data : {
					...data, records: data.records.filter(record => record.isActive && !record.isDeleted),
				}, [data, haveHistory]);
				if (!context || context.tripId !== tripId) throw new Error('useTrip requires the matching SingleTripProvider');
				return { ...context.trip, data: trip };
			},
		},
		mutations: {
			useCreateTrip: () =>
				useMutation<CreateTripMutationData, CreateTripMutationVariables>(
					CREATE_TRIP
				),
			useUpdateTrip: () =>
				useTripMutation<UpdateTripMutationData, UpdateTripMutationVariables>(
					UPDATE_TRIP, data => ({ kind: 'trip', value: data.updateTrip })
				),
			useCreateRecord: (tripId: ID) => useTripMutation<CreateRecordMutationData, CreateRecordMutationVariables>(CREATE_RECORD, data => ({ kind: 'record', value: data.createRecord }), tripId),
			useUpdateRecord: (tripId: ID) => useTripMutation<UpdateRecordMutationData, UpdateRecordMutationVariables>(UPDATE_RECORD, (data, variables) => ({ kind: 'record', value: data.updateRecord, editedRecordId: variables?.recordId }), tripId),
			useCreateAddress: (tripId: ID) => useTripMutation<CreateAddressMutationData, CreateAddressMutationVariables>(CREATE_ADDRESS, data => ({ kind: 'createAddress', value: data.createAddress }), tripId),
			useUpdateAddress: (tripId: ID) => useTripMutation<UpdateAddressMutationData, UpdateAddressMutationVariables>(UPDATE_ADDRESS, data => ({ kind: 'updateAddress', value: data.updateAddress }), tripId),
			useDeleteAddress: (tripId: ID) => useTripMutation<DeleteAddressMutationData, DeleteAddressMutationVariables>(DELETE_ADDRESS, data => ({ kind: 'deleteAddress', value: data.deleteAddress }), tripId),
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

function useTripMutation<T, V extends OperationVariables>(
	document: DocumentNode, change: (data: T, variables?: V) => TripChange, tripId?: string
): MutationTuple<T, V> {
	const client = useApolloClient();
	// Commit only a complete successful result, through the shared cache updater.
	const [mutate, result] = useMutation<T, V>(document, { fetchPolicy: 'no-cache' });
	const execute: MutationTuple<T, V>[0] = async options => {
		const response = await mutate(options);
		if (!response.errors?.length && response.data) {
			const id = tripId ?? options?.variables?.tripId;
			if (typeof id === 'string') updateTripCache(client.cache, id, change(response.data, options?.variables));
		}
		return response;
	};
	return [execute, result];
}
