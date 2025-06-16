'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';

export const MoneyShare = () => {
	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const [isFetching, setIsFetching] = React.useState(false);

	const context = useContext(SingleTripContext);
	const { data: tripData, refetch } = useTrip(context?.tripId || '');

	if (!context || !tripData) return null;

	if (tripData.moneyShare.length === 0) {
		return (
			<div className='text-center text-gray-500 mt-12'>
				目前帳目已結清，或沒有需要分帳的項目。
			</div>
		);
	}

	const waitSecondFunction = (seconds: number) => {
		return new Promise((resolve) => {
			setTimeout(resolve, seconds * 1000);
		});
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
