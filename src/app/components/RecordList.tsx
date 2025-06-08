'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { hexToSimple } from '@/app/lib/data';
import { Record } from '@/app/lib/types';

interface RecordListProps {
	onEdit: (record: Record) => void;
}

export const RecordList: React.FC<RecordListProps> = ({ onEdit }) => {
	const context = useContext(SingleTripContext);
	if (!context) return null;
	const { trip } = context;

	if (trip.records.length === 0) {
		return (
			<div className='text-center text-gray-500 mt-12'>
				還沒有任何帳目，點擊「新增」開始吧！
			</div>
		);
	}

	return (
		<div className='space-y-3'>
			{trip.records.map((record) => (
				<div
					key={record.id}
					className='bg-white p-4 rounded-lg shadow-md flex items-center justify-between'
				>
					<div className='flex-1'>
						<p className='font-bold text-lg text-gray-800'>{record.name}</p>
						<p className='text-sm text-gray-500 mt-1'>
							由 {hexToSimple(record.prePayAddress)} 墊付 $
							{record.amount.toLocaleString()}
						</p>
						<p className='text-sm text-gray-500 mt-1'>
							分攤人: {record.shouldPayAddress.map(hexToSimple).join(', ')}
						</p>
					</div>
					<div className='flex space-x-2'>
						<button
							onClick={() => onEdit(record)}
							className='text-blue-500 hover:text-blue-700 p-2'
						>
							✏️
						</button>
						<button
							onClick={() => {}}
							className='text-red-500 hover:text-red-700 p-2'
						>
							🗑️
						</button>
					</div>
				</div>
			))}
		</div>
	);
};
