'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';
import { Check, Link } from 'lucide-react';
import { Message } from './Message';
import { SideBar } from './SideBar';

export const Header = () => {
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
		<header className='flex min-w-0 gap-2 justify-between items-center py-2'>
			{isAlertVisible && (
				<Message variant='error' isShow>
					<span>{alertMessage}</span>
				</Message>
			)}
			<SideBar isOpen={isOpen} setIsOpen={setIsOpen} name={tripData.name} />
			<button type='button' onClick={handleShare} aria-label='分享行程' title='複製行程連結'
                className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 hover:bg-blue-50'>
                {isCopied ? <Check size={20} aria-hidden='true' /> : <Link size={20} aria-hidden='true' />}
            </button>
            <span role='status' className='sr-only'>{isCopied ? '已複製行程連結' : ''}</span>
        </header>
    );
};
