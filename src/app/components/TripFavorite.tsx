'use client';
import { useContext } from 'react';
import { SingleTripContext } from '../context/SingleTripProvider';
import { useMember } from '../context/MemberProvider';
import { useAuth } from '../context/AuthProvider';
export function TripFavorite({ tripId, name }: { tripId: string; name: string }) {
	const member = useMember();
	const trip = useContext(SingleTripContext);
	const auth = useAuth();
	const checked = !!member.user?.subscribedTrips.some(trip => trip.id === tripId);
	return <div className='mt-5 space-y-2'>
		<label className='flex justify-between gap-3'>收藏此行程<input type='checkbox' checked={checked} disabled={member.status !== 'ready' || member.pending > 0} onChange={() => void member.mutate(checked ? 'unsubscribeTrip' : 'subscribeTrip', tripId, name).catch(error => { if (trip?.tripId === tripId && error instanceof Error) trip.revoke(error); })} className='h-5 w-5 accent-blue-500' /></label>
		{auth.status !== 'authenticated' && <p className='text-xs'>登入後可收藏</p>}
		{member.status === 'loading' && <p role='status'>載入收藏中…</p>}
		{member.error && <p role='alert'>{member.error}</p>}
		{member.status === 'error' && <button onClick={() => void member.retry()} className='underline'>重試載入收藏</button>}
	</div>;
}
