'use client';

import React, { useContext } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';

interface RecordListProps {
	onEdit: (record: Record) => void;
}

export const RecordList: React.FC<RecordListProps> = ({ onEdit }) => {
	// 使用 GraphQL 客戶端的查詢
	const {
		queries: { useTrip },
		mutations: { useRemoveRecord },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');
	const [removeRecord, { loading: removing, error: removeError }] =
		useRemoveRecord(context?.tripId || '');

	if (!context || !tripData) return null;

	if (tripData.records.length === 0) {
		return (
			<div className='text-center text-gray-500 mt-12'>
				還沒有任何帳目，點擊「新增」開始吧！
			</div>
		);
	}

	if (removing) {
		return (
			<div className='text-center text-blue-500 mt-12'>正在刪除帳目...</div>
		);
	}
	if (removeError) {
		console.error('Error removing record:', removeError);
		return (
			<div className='text-center text-red-500 mt-12'>
				刪除失敗，請稍後再試。(
				{removeError.message == 'invalid record input'
					? '輸入含非法字符'
					: removeError.message}
				)
			</div>
		);
	}

	let nextDate: number = 0;

	return (
		<div className='space-y-3'>
			{tripData.records
				.map((record) => {
					return {
						...record,
						date: Number(record.time),
					};
				})
				.sort((a, b) => {
					if (b.date === a.date) {
						return a.name.localeCompare(b.name);
					}
					return a.date - b.date;
				})
				.map((record) => {
					const isNewDay = record.date >= nextDate;
					if (isNewDay) {
						const d = new Date(record.date);
						d.setDate(d.getDate() + 1);
						d.setHours(0, 0, 0, 0);
						nextDate = d.getTime();
					}

					return {
						...record,
						isNewDay,
					};
				})
				.map((record) => (
					<div key={record.id}>
						{record.isNewDay && (
							<div className='flex items-center my-4'>
								<div className='flex-grow border-t border-gray-300'></div>
								<span className='mx-4 text-gray-600 text-sm font-semibold'>
									{new Date(record.date).toLocaleDateString()}
								</span>
								<div className='flex-grow border-t border-gray-300'></div>
							</div>
						)}
						<div className='bg-white p-4 rounded-lg shadow-md flex items-center justify-between'>
							<div className='flex-1'>
								<p className='font-bold text-lg text-gray-800'>{record.name}</p>
								<p className='text-sm text-gray-500 mt-1'>
									由 {longStringSimplify(record.prePayAddress)} 墊付 $
									{record.amount.toLocaleString()}
								</p>
								<p className='text-sm text-gray-500 mt-1'>
									分攤人:{' '}
									{record.shouldPayAddress
										.map((addr) => longStringSimplify(addr))
										.join(', ')}
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
									onClick={() => {
										removeRecord({ variables: { recordId: record.id } });
									}}
									disabled={removing}
									className='text-red-500 hover:text-red-700 p-2'
								>
									🗑️
								</button>
							</div>
						</div>
					</div>
				))}
		</div>
	);
};
