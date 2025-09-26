'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';
import { longStringSimplify } from '../lib/utils';

export const AddressList = () => {
	const {
		queries: { useTrip },
		mutations: { useCreateAddress, useDeleteAddress },
	} = useGraphQLClient();

	const [newAddress, setNewAddress] = useState('');
	const [isAdding, setIsAdding] = useState(false);

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');

	const [createAddress, { loading: creating, error: createError }] =
		useCreateAddress(context?.tripId || '');
	const [removeAddress, { loading: removing, error: removeError }] =
		useDeleteAddress(context?.tripId || '');

	if (!context || !tripData) return null;

	if (creating) {
		return <div className='text-center text-blue-500 mt-12'>新增中...</div>;
	}
	if (createError) {
		console.error('Error creating address:', createError);
		return (
			<div className='text-center text-red-500 mt-12'>
				新增失敗，請稍後再試。(
				{createError.message == 'invalid address'
					? '輸入含非法字符'
					: createError.message}
				)
			</div>
		);
	}
	if (removing) {
		return <div className='text-center text-blue-500 mt-12'>移除中...</div>;
	}
	if (removeError) {
		console.error('Error removing address:', removeError);
		return (
			<div className='text-center text-red-500 mt-12'>
				移除失敗，請稍後再試。(
				{removeError.message == 'invalid address'
					? '輸入含非法字符'
					: removeError.message}
				)
			</div>
		);
	}

	const handleAddAddress = () => {
		if (newAddress.trim()) {
			console.log('Adding address:', newAddress.trim());
			createAddress({
				variables: {
					tripId: context.tripId,
					address: newAddress.trim(),
				},
			});
			setNewAddress('');
			setIsAdding(false);
		}
	};

	const handleRemoveAddress = (address: string) => {
		if (!address) return;

		const isConfirmed = window.confirm(
			'確定要移除此成員嗎？\n\n警告: 此操作將會刪除所有該成員墊付的交易紀錄，且無法復原。'
		);

		if (isConfirmed) {
			removeAddress({
				variables: {
					tripId: context.tripId,
					address,
				},
			});
		}
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
						<span className='text-gray-700 font-mono'>
							{longStringSimplify(address)}
						</span>
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
