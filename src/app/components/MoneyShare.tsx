'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';
import { Record, RecordCategory } from '../lib/tripApi/types';

interface MoneyShareProps {
	onRepay: (record: Omit<Record, 'id' | 'time' | 'isValid'>) => void;
}

export const MoneyShare: React.FC<MoneyShareProps> = ({ onRepay }) => {
	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const [isFetching, setIsFetching] = React.useState(false);

	const context = useContext(SingleTripContext);
	const { data: tripData, refetch } = useTrip(context?.tripId || '');

	if (!context || !tripData) return null;

	if (!tripData.isValid) {
		return (
			<div className='text-center text-red-500 mt-12'>
				注意: 包含待校正的帳目，請先校正後再進行結算。
			</div>
		);
	}

	if (tripData.moneyShare.length === 0) {
		return (
			<div className='text-center text-gray-500 mt-12'>
				帳目計算中，或沒有需要分帳的項目。
			</div>
		);
	}

	const waitSecondFunction = (seconds: number) => {
		return new Promise((resolve) => {
			setTimeout(resolve, seconds * 1000);
		});
	};

	const handleRepayClick = (
		payerAddress: string,
		receiverAddress: string,
		amount: number
	) => {
		const repayRecord: Omit<Record, 'id' | 'time' | 'isValid'> = {
			name: `${payerAddress} payback to ${receiverAddress}`,
			amount: amount,
			prePayAddress: payerAddress,
			shouldPayAddress: [receiverAddress],
			category: RecordCategory.TRANSFER,
			extendPayMsg: [amount],
		};
		onRepay(repayRecord);
	};

	return (
		<div className='bg-white p-4 rounded-lg shadow-md'>
			<h2 className='text-xl font-bold mb-4 text-gray-800'>
				結算{' '}
				<button
					onClick={() => {
						if (isFetching) return;
						setIsFetching(true);
						// refetch the trip data
						refetch()
							.then(() => {
								// wait for 1 second to ensure UI updates
								waitSecondFunction(1).then(() => {
									setIsFetching(false);
								});
							})
							.catch((error) => {
								console.error('Error refetching trip data:', error);
								setIsFetching(false);
							});
					}}
					disabled={isFetching}
					className='rounded hover:bg-gray-200 transition-colors disabled:opacity-50 text-blue-500'
					aria-label='refresh money share'
				>
					{isFetching ? (
						<span className='loader'>fetching...</span>
					) : (
						<span className='material-icons'>refresh</span>
					)}
				</button>
			</h2>
			<div className='space-y-4'>
				{tripData.moneyShare.map((tx, index) => (
					<div key={index} className='p-3 bg-gray-50 rounded-lg'>
						{/* Input 部分 */}
						{tx.input.map((inputItem, inputIndex) => (
							<div
								key={inputIndex}
								className='flex items-center justify-between mb-2'
							>
								<span className='font-semibold text-gray-700'>
									{longStringSimplify(inputItem.address)}
								</span>
								<div className='flex items-center space-x-2'>
									<button
										onClick={() =>
											handleRepayClick(
												inputItem.address,
												tx.output.address,
												inputItem.amount
											)
										}
										className='bg-blue-500 hover:bg-blue-700 text-white text-sm font-bold py-1 px-2 rounded-lg transition duration-300'
									>
										payback
									</button>
									<span className='text-lg font-bold text-red-600'>支付</span>
									<span className='text-sm text-red-500'>
										${inputItem.amount.toFixed(2)}
									</span>
								</div>
							</div>
						))}
						{/* 分隔線 */}
						<hr className='my-2 border-gray-300' />
						{/* Output 部分 */}
						<div className='flex items-center justify-between mt-2'>
							<span className='font-semibold text-gray-700'>
								{longStringSimplify(tx.output.address)}
							</span>
							<div className='flex items-center space-x-2'>
								<span className='text-lg font-bold text-green-600'>收到</span>
								<span className='text-sm text-green-500'>
									${tx.output.amount.toFixed(2)}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
};
