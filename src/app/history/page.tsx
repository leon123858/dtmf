'use client';

import { useMember } from '../context/MemberProvider';
import { mergeHistory } from '../lib/storage/trip';
import { useEffect, useState } from 'react';
import { GetTripListFromStorage, TripHistoryItem } from '../lib/storage/trip';
import { Header } from '@/app/components/SimpleHeader';
import { useRouter } from 'next/navigation';

export default function HistoryPage() {
	const [history, setHistory] = useState<TripHistoryItem[]>([]);
	const router = useRouter();
	const member = useMember();
	const [filter, setFilter] = useState('全部');
	const entries = mergeHistory(history, member.user?.subscribedTrips || []).filter(item => filter === '全部' || (filter === '本機' ? item.local : item.saved));

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const storedHistory = GetTripListFromStorage();
			if (storedHistory) {
				setHistory(storedHistory.sort((a, b) => b.timestamp - a.timestamp));
			}
		}
	}, []);

	return (
		<div className='bg-gray-100 font-sans min-h-screen'>
			<div className='container mx-auto max-w-lg p-4'>
				<Header name='瀏覽歷史' />
				<main className='container mx-auto p-4'>
					<h1 className='text-2xl font-bold mb-4'>您看過的行程</h1>
					<div className='flex gap-3 mb-4' role='group' aria-label='歷史來源'>{['全部', '本機', '收藏'].map(value => <button key={value} aria-pressed={filter === value} className='rounded bg-white p-3 aria-pressed:bg-blue-600 aria-pressed:text-white' onClick={() => setFilter(value)}>{value}</button>)}</div>
					{member.error && <p role='alert'>{member.error}</p>}
					{member.status === 'error' && <button onClick={() => void member.retry()}>重試載入收藏</button>}
					{entries.length === 0 ? (
						<p className='text-gray-600'>
							目前沒有瀏覽歷史紀錄。
							<button
								onClick={() => router.push('/')}
								className='block text-blue-600 hover:underline'
							>
								回首頁
							</button>
						</p>
					) : (
						<ul className='bg-white shadow rounded-lg divide-y divide-gray-200'>
							{entries.map((item) => (
								<li key={item.id} className='p-4 hover:bg-gray-50'>
									<button
										onClick={() => router.push(`/trip/${item.id}`)}
										className='block text-blue-600 hover:underline'
									>
										{item.name}
									</button>
									<p className='text-sm text-gray-500 mt-1'>
										{[item.local && '本機', item.saved && '收藏'].filter(Boolean).join('・')} · 瀏覽時間: {new Date(item.timestamp).toLocaleString()}
									</p>
								</li>
							))}
						</ul>
					)}
				</main>
			</div>
		</div>
	);
}
