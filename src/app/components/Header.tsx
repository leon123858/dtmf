'use client';

import React, { useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';
import { Message } from './Message';

interface HeaderProps {
	onAddClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onAddClick }) => {
	const {
		queries: { useTrip },
		subscriptions: {
			// useSubAddressDelete,
			// useSubAddressCreate,
			// useSubRecordCreate,
			// useSubRecordDelete,
			// useSubRecordUpdate,
		},
	} = useGraphQLClient();

	const router = useRouter();
	const [isCopied, setIsCopied] = useState(false);
	// const [isSyncing, setIsSyncing] = useState(false);

	const [isAlertVisible, setIsAlertVisible] = useState(false);
	const [alertMessage, setAlertMessage] = useState('');

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');

	// const {
	// 	data: subAddressDeleteData,
	// 	error: subAddressDeleteError,
	// 	// loading: subAddressDeleteLoading,
	// } = useSubAddressDelete(context?.tripId || '');
	// const {
	// 	data: subAddressCreateData,
	// 	error: subAddressCreateError,
	// 	// loading: subAddressCreateLoading,
	// } = useSubAddressCreate(context?.tripId || '');
	// const {
	// 	data: subRecordCreateData,
	// 	error: subRecordCreateError,
	// 	// loading: subRecordCreateLoading,
	// } = useSubRecordCreate(context?.tripId || '');
	// const {
	// 	data: subRecordDeleteData,
	// 	error: subRecordDeleteError,
	// 	// loading: subRecordDeleteLoading,
	// } = useSubRecordDelete(context?.tripId || '');
	// const {
	// 	data: subRecordUpdateData,
	// 	error: subRecordUpdateError,
	// 	// loading: subRecordUpdateLoading,
	// } = useSubRecordUpdate(context?.tripId || '');

	// useEffect(() => {
	// 	// 當 data 有值時 (表示收到了伺服器的推送)
	// 	if (
	// 		subAddressDeleteData ||
	// 		subAddressCreateData ||
	// 		subRecordCreateData ||
	// 		subRecordDeleteData ||
	// 		subRecordUpdateData
	// 	) {
	// 		setIsSyncing(true);
	// 		console.log('Received new data, refetching...');
	// 		refetch();
	// 		setIsSyncing(false);
	// 	}
	// }, [
	// 	subAddressDeleteData,
	// 	subAddressCreateData,
	// 	subRecordCreateData,
	// 	subRecordDeleteData,
	// 	subRecordUpdateData,
	// 	refetch,
	// ]);

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
		<header className='flex justify-between items-center py-4'>
			{isAlertVisible && (
				<Message variant='error' isShow>
					<span>{alertMessage}</span>
				</Message>
			)}
			{/* {subAddressDeleteError ||
			subAddressCreateError ||
			subRecordCreateError ||
			subRecordDeleteError ||
			subRecordUpdateError ? (
				<Message variant='error' isShow>
					<span>遠端資訊同步失敗，請重新嘗試開啟。</span>
				</Message>
			) : null} */}
			{/* <Message variant={'info'} isShow={isSyncing}>
				<span>其他人更新中...</span>
			</Message> */}
			<div className='flex items-center space-x-3'>
				<button
					onClick={() => router.push('/')}
					className='text-blue-500 hover:text-blue-700 text-2xl font-bold'
				>
					🏠
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
