import { createHttpClient } from '../graphClient/http';
import { TripClient } from './client';

/** Request-local transport: never retain a browser identity on the server. */
export function createServerTripApi(token?: string): Pick<TripClient, 'createTrip'> {
	const client = createHttpClient(token);
	return {
		async createTrip(input) {
			try { return await new TripClient(client).createTrip(input); }
			finally { client.stop(); }
		},
	};
}
