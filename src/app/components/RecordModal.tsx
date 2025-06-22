'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';

interface RecordModalProps {
	onClose: () => void;
	record: Record | null; // The record being edited, or null for a new one
}

export const RecordModal: React.FC<RecordModalProps> = ({
	onClose,
	record,
}) => {
	const {
		queries: { useTrip },
		mutations: { useCreateRecord, useUpdateRecord },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');
	const [name, setName] = useState(record?.name || '');
	const [amount, setAmount] = useState(
		record?.amount ? record.amount.toString() : ''
	);
	const [prePayAddress, setPrePayAddress] = useState(
		record?.prePayAddress || tripData?.addressList[0] || ''
	);
	const [shouldPayAddress, setShouldPayAddress] = useState<string[]>(
		record?.shouldPayAddress || []
	);

	const [updateRecord, { loading: updating, error: updateError }] =
		useUpdateRecord(context?.tripId || '');
	const [createRecord, { loading: creating, error: createError }] =
		useCreateRecord(context?.tripId || '');

	if (!context) return null;
	if (!tripData) return null;

	if (creating) {
		return <div className='text-center text-blue-500 mt-12'>新增中...</div>;
	}
	if (createError) {
		console.error('Error creating record:', createError);
		return (
			<div className='text-center text-red-500 mt-12'>
				新增失敗，請稍後再試。
			</div>
		);
	}

	if (updating) {
		return <div className='text-center text-blue-500 mt-12'>更新中...</div>;
	}
	if (updateError) {
		console.error('Error updating record:', updateError);
		return (
			<div className='text-center text-red-500 mt-12'>
				更新失敗，請稍後再試。
			</div>
		);
	}

	const handleShouldPayToggle = (address: string) => {
		setShouldPayAddress((prev) =>
			prev.includes(address)
				? prev.filter((a) => a !== address)
				: [...prev, address]
		);
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const finalAmount = parseFloat(amount);
		if (
			isNaN(finalAmount) ||
			!name.trim() ||
			!prePayAddress ||
			shouldPayAddress.length === 0
		) {
			console.error('Invalid input:', {
				name,
				amount,
				prePayAddress,
				shouldPayAddress,
			});
			return;
		}

		const newRecordData = {
			name,
			amount: finalAmount,
			prePayAddress,
			shouldPayAddress,
		};

		if (record) {
			// Editing existing record
			updateRecord({
				variables: {
					recordId: record.id,
					input: newRecordData,
				},
			}).catch((error) => {
				console.error('Error updating record:', error);
				alert(
					'更新失敗，請稍後再試。(' +
						(error.message == 'invalid record input'
							? '輸入含非法字符'
							: error.message) +
						')'
				);
			});
		} else {
			// Creating new record
			createRecord({
				variables: {
					tripId: tripData.id,
					input: newRecordData,
				},
			}).catch((error) => {
				console.error('Error creating record:', error);
				alert(
					'新增失敗，請稍後再試。(' +
						(error.message == 'invalid record input'
							? '輸入含非法字符'
							: error.message) +
						')'
				);
			});
		}
		onClose();
	};

	const title = record ? '編輯帳目' : '新增帳目';
	const submitText = record ? '儲存變更' : '新增';

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start p-4 z-30 overflow-y-auto'>
			<div className='bg-white rounded-lg shadow-xl p-6 w-full max-w-md'>
				<h2 className='text-2xl font-bold mb-4'>{title}</h2>
				<form onSubmit={handleSubmit}>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							項目名稱
						</label>
						<input
							type='text'
							value={name}
							onChange={(e) => setName(e.target.value)}
							className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
							required
						/>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							金額
						</label>
						<input
							type='number'
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
							required
						/>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							預付人
						</label>
						<select
							value={prePayAddress}
							onChange={(e) => setPrePayAddress(e.target.value)}
							className='shadow border rounded w-full py-2 px-3 text-gray-700'
						>
							{tripData.addressList.map((addr) => (
								<option key={addr} value={addr}>
									{longStringSimplify(addr)}
								</option>
							))}
						</select>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							分攤人{' '}
							<label
								onClick={() => {
									setShouldPayAddress(tripData.addressList);
								}}
								className='rounded hover:bg-gray-200 transition-colors disabled:opacity-50 text-blue-500'
								aria-label='click all'
							>
								全選
							</label>
						</label>
						<div className='grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-md'>
							{tripData.addressList.map((addr) => (
								<label
									key={addr}
									className='flex items-center space-x-2 p-2 rounded-md hover:bg-gray-200 cursor-pointer'
								>
									<input
										type='checkbox'
										checked={shouldPayAddress.includes(addr)}
										onChange={() => handleShouldPayToggle(addr)}
										className='form-checkbox h-5 w-5 text-blue-600'
									/>
									<span className='text-gray-700'>
										{longStringSimplify(addr)}
									</span>
								</label>
							))}
						</div>
					</div>
					<div className='flex items-center justify-end space-x-3 mt-6'>
						<button
							type='button'
							onClick={onClose}
							className='bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300'
						>
							取消
						</button>
						<button
							type='submit'
							className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300'
						>
							{submitText}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
