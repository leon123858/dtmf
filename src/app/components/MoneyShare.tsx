'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';

export const MoneyShare = () => {
	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');

	if (!context || !tripData) return null;

	if (tripData.moneyShare.length === 0) {
		return (
			<div className='text-center text-gray-500 mt-12'>
				目前帳目已結清，或沒有需要分帳的項目。
			</div>
		);
	}

	return (
		<div className='bg-white p-4 rounded-lg shadow-md'>
			<h2 className='text-xl font-bold mb-4 text-gray-800'>結算</h2>
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
