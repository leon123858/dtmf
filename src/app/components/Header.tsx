'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';
import { Message } from './Message';
import { SideBar } from './SideBar';

interface HeaderProps {
	onAddClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onAddClick }) => {
	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const [isCopied, setIsCopied] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const [isAlertVisible, setIsAlertVisible] = useState(false);
	const [alertMessage, setAlertMessage] = useState('');

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
				setIsAlertVisible(true);
				setAlertMessage('無法複製網址，請手動複製。');
				setTimeout(() => {
					setIsAlertVisible(false);
					setAlertMessage('');
				}, 3000);
			});
	};

	return (
		<header className='flex min-w-0 gap-2 justify-between items-center py-4'>
			{isAlertVisible && (
				<Message variant='error' isShow>
					<span>{alertMessage}</span>
				</Message>
			)}
			<SideBar isOpen={isOpen} setIsOpen={setIsOpen} name={tripData.name} />
			<div className='flex shrink-0 items-center gap-2 whitespace-nowrap'>
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
