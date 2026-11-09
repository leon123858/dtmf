import type { TripApi } from './public';
import type { TripClient } from './client';
import { TripApiError } from './public';

export function createTripStore(client: TripClient, tripId: string, haveHistory: boolean, identity: () => string | number, session = identity()): TripApi {
 const current = () => session === identity();
 const run = <T>(operation: () => Promise<T>): Promise<T> => current() ? operation() : Promise.reject(new TripApiError('session-changed', '登入已變更。'));
 return {
  subscribe: listener => client.subscribe(tripId, listener),
  getSnapshot: () => {
   if (!current()) return undefined;
   const value = client.getSnapshot(tripId, haveHistory);
   return value === undefined ? client.getSnapshot(tripId, !haveHistory) : value;
  },
  flush: () => run(() => client.flush(tripId)),
  refresh: (options = {}) => run(() => client.refresh({ tripId, haveHistory, ...options })),
  forceRefresh: () => run(() => client.forceRefresh({ tripId, haveHistory })),
  updateTrip: input => run(() => client.updateTrip({ ...input, tripId })),
  createRecord: input => run(() => client.createRecord({ ...input, tripId })),
  updateRecord: input => run(() => client.updateRecord({ ...input, tripId })),
  createAddress: input => run(() => client.createAddress({ ...input, tripId })),
  updateAddress: input => run(() => client.updateAddress({ ...input, tripId })),
  deleteAddress: input => run(() => client.deleteAddress({ ...input, tripId })),
 };
}
