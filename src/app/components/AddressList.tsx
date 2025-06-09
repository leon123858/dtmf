'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';

export const AddressList = () => {
	const {
		queries: { useTrip },
		mutations: { useCreateAddress, useDeleteAddress },
	} = useGraphQLClient();

	const [newAddress, setNewAddress] = useState('');
	const [isAdding, setIsAdding] = useState(false);

	const context = useContext(SingleTripContext);
	const { data: tripData, refetch } = useTrip(context?.tripId || '');

	const [createAddress, { loading: creating, error: createError }] =
		useCreateAddress();
	const [removeAddress, { loading: removing, error: removeError }] =
		useDeleteAddress();

	if (!context || !tripData) return null;

	const handleAddAddress = () => {
		if (newAddress.trim()) {
			createAddress({
				variables: {
					tripId: context.tripId,
					address: newAddress.trim(),
				},
			}).catch((error) => {
				console.error('Error creating address:', error);
				alert('新增失敗，請稍後再試。');
			});
			setNewAddress('');
			setIsAdding(false);
			refetch();
		}
	};

	const handleRemoveAddress = (address: string) => {
		if (!address) return;
		removeAddress({
			variables: {
				tripId: context.tripId,
				address,
			},
		}).catch((error) => {
			console.error('Error removing address:', error);
			alert('移除失敗，請稍後再試。');
		});
		refetch();
	};

	return (
		<div className='bg-white p-4 rounded-lg shadow-md'>
			<h2 className='text-xl font-bold mb-4 text-gray-800'>成員列表</h2>
			<div className='space-y-2 mb-4'>
				{tripData.addressList.map((address) => (
					<div
						key={address}
						className='flex justify-between items-center bg-gray-50 p-3 rounded-md'
					>
						<span className='text-gray-700 font-mono'>{address}</span>
						<button
							onClick={() => handleRemoveAddress(address)}
							className='text-red-400 hover:text-red-600 font-bold'
						>
							移除
						</button>
					</div>
				))}
			</div>
			{isAdding ? (
				<div className='flex space-x-2 mt-4'>
					<input
						type='text'
						value={newAddress}
						onChange={(e) => setNewAddress(e.target.value)}
						placeholder='輸入新成員地址 (e.g., 0x...)'
						className='flex-grow p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
					/>
					<button
						onClick={handleAddAddress}
						className='bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600'
					>
						新增
					</button>
					<button
						onClick={() => setIsAdding(false)}
						className='bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400'
					>
						取消
					</button>
				</div>
			) : (
				<button
					onClick={() => setIsAdding(true)}
					className='w-full bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 transition duration-300'
				>
					新增成員
				</button>
			)}
		</div>
	);
};
