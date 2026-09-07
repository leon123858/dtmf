import { InMemoryCache, TypePolicies } from '@apollo/client';

export const tripTypePolicies: TypePolicies = {
			Query: { fields: { trip: { keyArgs: ['tripId', 'haveHistory'], merge: false } } },
			// The two query variants contain different record lists for the same trip.
			Trip: { keyFields: false },
};

export function createTripCache() { return new InMemoryCache({ typePolicies: tripTypePolicies }); }
