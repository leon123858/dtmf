'use client';

import { useApolloClient, useReactiveVar } from '@apollo/client';
import { useState } from 'react';
import { refreshTrip, tripSyncFailures } from '../lib/tripApi/sync';

export function TripSyncNotice({ tripId }: { tripId: string }) {
	const failures = useReactiveVar(tripSyncFailures);
	const client = useApolloClient();
	const [retrying, setRetrying] = useState(false);
	if (!failures.includes(tripId)) return null;
	return <div role='alert' className='rounded-lg bg-amber-100 text-amber-900 p-3 mb-3 text-sm'>
		Saved successfully, but refreshing failed. Your changes are saved. ⚠️
		<button className='block underline font-semibold mt-2' disabled={retrying} onClick={async () => {
			setRetrying(true);
			await refreshTrip(client, tripId);
			setRetrying(false);
		}}>{retrying ? 'Refreshing… ⏳' : 'Refresh 🔄'}</button>
	</div>;
}
