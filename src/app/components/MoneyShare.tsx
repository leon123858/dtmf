'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { hexToSimple } from '@/app/lib/data';
import { useGraphQLClient } from '@/app/lib/tripApi/client';

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
					<div
						key={index}
						className='flex items-center justify-center space-x-4 p-3 bg-gray-50 rounded-lg'
					>
						<span className='font-semibold text-gray-700'>
							{hexToSimple(tx.input[0].address)}
						</span>
						<div className='flex flex-col items-center'>
							<span className='text-lg font-bold text-blue-600'>→</span>
							<span className='text-sm text-blue-500'>
								${tx.input[0].amount.toFixed(2)}
							</span>
						</div>
						<span className='font-semibold text-gray-700'>
							{hexToSimple(tx.output.address)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
