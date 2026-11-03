'use client';
import { StarIcon } from '@heroicons/react/24/outline';
import { SettingSwitch } from './SettingSwitch';
import { useContext } from 'react';
import { SingleTripContext } from '../context/SingleTripProvider';
import { useMember } from '../context/MemberProvider';
import { useAuth } from '../context/AuthProvider';
export function TripFavorite({
	tripId,
	name,
}: {
	tripId: string;
	name: string;
}) {
	const member = useMember();
	const trip = useContext(SingleTripContext);
	const auth = useAuth();
	const checked = !!member.user?.subscribedTrips.some(
		(trip) => trip.id === tripId
	);
	return (
		<div className='space-y-2 border-b border-slate-100 py-5'>
			<div className='flex items-center gap-3'>
				<StarIcon aria-hidden className='h-6 w-6 shrink-0 text-slate-500' />
				<div className='min-w-0 flex-1'>
					<label htmlFor='trip-favorite' className='font-semibold'>
						收藏此行程
					</label>
					<p id='favorite-description' className='mt-1 text-sm text-slate-500'>
						加入帳號收藏；收藏不代表加入旅程或取得私有旅程權限。
					</p>
				</div>
				<SettingSwitch
					id='trip-favorite'
					aria-label='收藏此行程'
					aria-describedby='favorite-description'
					checked={checked}
					disabled={
						auth.status !== 'authenticated' ||
						member.status !== 'ready' ||
						member.pending > 0
					}
					onChange={() =>
						void member
							.mutate(
								checked ? 'unsubscribeTrip' : 'subscribeTrip',
								tripId,
								name
							)
							.catch((error) => {
								if (trip?.tripId === tripId && error instanceof Error)
									trip.revoke(error);
							})
					}
				/>
			</div>
			{auth.status !== 'authenticated' && (
				<p className='text-xs'>登入後可收藏</p>
			)}
			{member.status === 'loading' && <p role='status'>載入收藏中…</p>}
			{member.error && <p role='alert'>{member.error}</p>}
			{member.status === 'error' && (
				<button onClick={() => void member.retry()} className='underline'>
					重試載入收藏
				</button>
			)}
		</div>
	);
}
