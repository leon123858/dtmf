'use client';

import React, { useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';

interface HeaderProps {
	onAddClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onAddClick }) => {
	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const router = useRouter();
	const [isCopied, setIsCopied] = useState(false);

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');

	if (!context || !tripData) return null;

	const handleShare = () => {
		const shareUrl = window.location.href; // Next.js 中直接用 href 即可
		navigator.clipboard
			.writeText(shareUrl)
			.then(() => {
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2500);
			})
			.catch((err) => {
				console.error('無法複製網址: ', err);
				alert('複製網址失敗！');
			});
	};

	return (
		<header className='flex justify-between items-center py-4'>
			<div className='flex items-center space-x-3'>
				<button
					onClick={() => router.push('/')}
					className='text-blue-500 hover:text-blue-700 text-2xl font-bold'
				>
					‹
				</button>
				<h1 className='text-3xl font-bold text-gray-800 truncate'>
					{tripData.name}
				</h1>
			</div>
			<div className='flex items-center space-x-2'>
				<button
					onClick={handleShare}
					className={`py-2 px-3 rounded-lg shadow-md transition-all duration-300 ${
						isCopied
							? 'bg-green-500 text-white'
							: 'bg-gray-200 hover:bg-gray-300'
					}`}
				>
					{isCopied ? '已複製！' : '🔗 分享'}
				</button>
				<button
					onClick={onAddClick}
					className='bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300'
				>
					新增
				</button>
			</div>
		</header>
	);
};
