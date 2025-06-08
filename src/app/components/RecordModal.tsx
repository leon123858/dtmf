'use client';

import React, { useState, useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { hexToSimple } from '@/app/lib/data';

interface RecordModalProps {
	onClose: () => void;
	record: Record | null; // The record being edited, or null for a new one
}

export const RecordModal: React.FC<RecordModalProps> = ({
	onClose,
	record,
}) => {
	const context = useContext(SingleTripContext);

	if (!context) return null;
	const { trip } = context;

	const [name, setName] = useState(record ? record.name : '');
	const [amount, setAmount] = useState(record ? String(record.amount) : '');
	const [prePayAddress, setPrePayAddress] = useState(
		record ? record.prePayAddress : trip.addressList[0] || ''
	);
	const [shouldPayAddress, setShouldPayAddress] = useState<string[]>(
		record ? record.shouldPayAddress : []
	);

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
			alert('請填寫所有欄位！');
			return;
		}

		// const newRecordData = {
		// 	name,
		// 	amount: finalAmount,
		// 	prePayAddress,
		// 	shouldPayAddress,
		// };

		if (record) {
			// Editing existing record
			// api.updateRecord(record.id, newRecordData);
		} else {
			// Creating new record
			// api.createRecord(newRecordData);
		}
		onClose();
	};

	const title = record ? '編輯帳目' : '新增帳目';
	const submitText = record ? '儲存變更' : '新增';

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50'>
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
							{trip.addressList.map((addr) => (
								<option key={addr} value={addr}>
									{hexToSimple(addr)}
								</option>
							))}
						</select>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							分攤人
						</label>
						<div className='grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-md'>
							{trip.addressList.map((addr) => (
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
									<span className='text-gray-700'>{hexToSimple(addr)}</span>
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
