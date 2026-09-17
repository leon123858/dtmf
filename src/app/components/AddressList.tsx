'use client';

import React, { useState, useContext, useEffect } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '../lib/tripApi/client';
import { longStringSimplify } from '../lib/utils';

export const AddressList = () => {
	const {
		queries: { useTrip },
		mutations: { useCreateAddress, useUpdateAddress, useDeleteAddress },
	} = useGraphQLClient();

	const [newAddress, setNewAddress] = useState('');
	const [isAdding, setIsAdding] = useState(false);
	const [editingAddress, setEditingAddress] = useState<{ id: string; name: string } | null>(null);
	const editingAddressId = editingAddress?.id ?? null;
	const editingAddressName = editingAddress?.name ?? '';
	const [showError, setShowError] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');

	const [createAddress, { loading: creating }] =
		useCreateAddress(context?.tripId || '');
	const [updateAddress, { loading: updating }] = useUpdateAddress(
		context?.tripId || ''
	);
	const [removeAddress, { loading: removing }] =
		useDeleteAddress(context?.tripId || '');

	// auto setShowError to false after 3 seconds
	useEffect(() => {
		if (showError) {
			const timer = setTimeout(() => {
				setShowError(false);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [showError]);

	if (!context || !tripData) return null;

 const handleAddAddress = async () => {
  if (!newAddress.trim() || creating) return;
  try {
   await createAddress({ variables: { tripId: context.tripId, input: { name: newAddress.trim() } } });
   setNewAddress('');
   setIsAdding(false);
  } catch (error) {
   setErrorMessage(error instanceof Error ? error.message : 'Adding member failed. ⚠️');
   setShowError(true);
  }
 };

	const handleRemoveAddress = (addressId: string) => {
		if (!addressId || removing) return;

		removeAddress({
			variables: {
				tripId: context.tripId,
				addressId,
			},
		})
			.then(() => {
				setShowError(false);
			})
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : '';
				console.error('Error removing address:', error);
				setErrorMessage(
					message === 'invalid address'
						? '輸入含非法字符'
						: message.includes('SQL')
						? '不可移除含關聯數據的用戶'
						: `未預期錯誤，請稍後再試...${message}`
				);
				setShowError(true);
			});
	};

	const stopEditingAddress = () => {
		setEditingAddress(null);
	};

	const handleStartEditingAddress = (addressId: string, name: string) => {
		setEditingAddress({ id: addressId, name });
	};

	const handleUpdateAddress = () => {
		if (!editingAddressId || updating) return;

		const name = editingAddressName.trim();
		if (!name) return;

		const currentAddress = tripData.addresses.find(
			(address) => address.id === editingAddressId
		);
		if (currentAddress?.name === name) {
			stopEditingAddress();
			return;
		}

		updateAddress({
			variables: {
				tripId: context.tripId,
				addressId: editingAddressId,
				input: { name },
			},
		})
			.then(() => {
				setShowError(false);
				setEditingAddress(current => current?.id === editingAddressId ? null : current);
			})
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : '';
				console.error('Error updating address:', error);
				setErrorMessage(
					message === 'invalid address'
						? '輸入含非法字符'
						: `改名失敗，請稍後再試...${message}`
				);
				setShowError(true);
			});
	};

	return (
		<div className='bg-white p-4 rounded-lg shadow-md'>
			{showError && (
				// show error on top of modal
				<div
					className='fixed top-5 left-1/2 -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md z-50'
					role='alert'
				>
					<span className='block sm:inline'>{errorMessage}</span>
				</div>
			)}
			<h2 className='text-xl font-bold mb-4 text-gray-800'>成員列表</h2>
			<div className='space-y-2 mb-4'>
				{tripData.addresses.map((address) => {
					const isEditing = editingAddressId === address.id;

					return (
						<div
							key={address.id}
							className='flex justify-between items-center gap-2 bg-gray-50 p-3 rounded-md'
						>
							{isEditing ? (
								<>
									<input
										type='text'
										value={editingAddressName}
										onChange={(event) =>
											setEditingAddress({ id: address.id, name: event.target.value })
										}
										onKeyDown={(event) => {
											if (event.key === 'Enter') handleUpdateAddress();
											if (event.key === 'Escape') stopEditingAddress();
										}}
										disabled={updating}
										autoFocus
										aria-label={`修改 ${address.name} 的名稱`}
										className='min-w-0 flex-grow p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100'
									/>
									<button
										onClick={handleUpdateAddress}
										disabled={!editingAddressName.trim() || updating}
										className='text-blue-500 hover:text-blue-700 font-bold disabled:text-gray-300'
									>
										{updating ? '儲存中...' : '儲存'}
									</button>
									<button
										onClick={stopEditingAddress}
										disabled={updating}
										className='text-gray-500 hover:text-gray-700 font-bold disabled:text-gray-300'
									>
										取消
									</button>
								</>
							) : (
								<>
									<span className='min-w-0 flex-grow text-gray-700 font-mono'>
										{longStringSimplify(address.name)}
									</span>
									<button
										onClick={() =>
											handleStartEditingAddress(address.id, address.name)
										}
										className='text-blue-400 hover:text-blue-600 font-bold'
									>
										改名
									</button>
									<button
										disabled={removing} onClick={() => handleRemoveAddress(address.id)}
										className='text-red-400 hover:text-red-600 font-bold'
									>
										移除
									</button>
								</>
							)}
						</div>
					);
				})}
			</div>
			{isAdding ? (
				<div className='flex space-x-2 mt-4'>
					<input
						type='text'
						value={newAddress}
						disabled={creating}
						onChange={(e) => setNewAddress(e.target.value)}
						placeholder='輸入新成員名稱'
						className='min-w-0 flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
					/>
					<button
						disabled={creating} onClick={handleAddAddress}
						aria-busy={creating}
						className='inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:cursor-wait'
					>
						{creating && (
							<svg className='h-4 w-4 animate-spin' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
								<circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
								<path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' />
							</svg>
						)}
						<span>{creating ? '新增中...' : '新增'}</span>
					</button>
					<button
						onClick={() => setIsAdding(false)}
						disabled={creating}
						className='shrink-0 whitespace-nowrap bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400'
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
