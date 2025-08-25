'use client';

import { useEffect, useState } from 'react';
import { GetTripListFromStorage, TripHistoryItem } from '../lib/storage/trip';
import { Header } from '@/app/components/SimpleHeader';
import { useRouter } from 'next/navigation';

export default function HistoryPage() {
	const [history, setHistory] = useState<TripHistoryItem[]>([]);
	const router = useRouter();

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
					{history.length === 0 ? (
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
							{history.map((item) => (
								<li key={item.id} className='p-4 hover:bg-gray-50'>
									<button
										onClick={() => router.push(`/trip/${item.id}`)}
										className='block text-blue-600 hover:underline'
									>
										{item.name}
									</button>
									<p className='text-sm text-gray-500 mt-1'>
										瀏覽時間: {new Date(item.timestamp).toLocaleString()}
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
