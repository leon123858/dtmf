import { createHttpClient } from '../graphClient/http';
import { TripApi } from './client';
import type { TripService } from './public';

/** Request-local transport: never retain a browser identity on the server. */
export function createServerTripApi(token?: string): Pick<TripService, 'createTrip'> {
	const client = createHttpClient(token);
	return {
		async createTrip(input) {
			try { return await new TripApi(client).createTrip(input); }
			finally { client.stop(); }
		},
	};
}
