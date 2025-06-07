'use client'; // 因為有 state 和事件處理

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // 使用 Next.js 的 router
import { useTrips } from '@/app/context/TripProvider';

export default function HomePage() {
	const [tripName, setTripName] = useState('');
	const router = useRouter();
	const { createTrip } = useTrips();

	useEffect(() => {
		document.title = '旅遊分帳應用 | 輕鬆建立旅程';
	}, []);

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (tripName.trim()) {
			const newTrip = createTrip(tripName.trim());
			router.push(`/trip/${newTrip.id}`); // 導航到新的旅程頁面
		}
	};

	return (
		<div className='bg-gray-100 min-h-screen flex flex-col items-center justify-center p-4'>
			<div className='w-full max-w-md text-center'>
				<h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
					旅遊分帳
				</h1>
				<p className='text-lg text-gray-600 mb-8'>
					輕鬆、公平地分攤旅途中的每一筆花費。
				</p>

				<form
					onSubmit={handleSubmit}
					className='bg-white p-8 rounded-xl shadow-lg'
				>
					<h2 className='text-2xl font-semibold text-gray-700 mb-6'>
						建立一個新旅程
					</h2>
					<input
						type='text'
						value={tripName}
						onChange={(e) => setTripName(e.target.value)}
						placeholder='例如：2024 日本關西之旅'
						className='w-full p-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
						required
					/>
					<button
						type='submit'
						className='w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 mt-6 text-lg'
					>
						開始分帳
					</button>
				</form>
			</div>
		</div>
	);
}
