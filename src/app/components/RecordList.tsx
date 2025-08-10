'use client';

import React, { useContext, useMemo, useRef } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';

interface RecordListProps {
	onEdit: (record: Record) => void;
}

// 預估高度
const CARD_HEIGHT = 115;
const SEPARATOR_HEIGHT = 50;

export const RecordList: React.FC<RecordListProps> = ({ onEdit }) => {
	const {
		queries: { useTrip },
		mutations: { useRemoveRecord },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const { data: tripData } = useTrip(context?.tripId || '');
	const [removeRecord, { loading: removing, error: removeError }] =
		useRemoveRecord(context?.tripId || '');

	const processedRecords = useMemo(() => {
		if (!tripData || !tripData.records) return null;

		let nextDate: number = 0;

		return tripData.records
			.map((record) => ({
				...record,
				date: Number(record.time),
			}))
			.sort((a, b) => {
				if (b.date === a.date) {
					return a.name.localeCompare(b.name);
				}
				return a.date - b.date;
			})
			.map((record) => {
				const d = new Date(record.date);
				d.setHours(0, 0, 0, 0); // 將日期標準化到當天的 0 點
				const currentDayStart = d.getTime();

				const isNewDay = currentDayStart >= nextDate;
				if (isNewDay) {
					// nextDate 設為明天的 0 點
					nextDate = currentDayStart + 24 * 60 * 60 * 1000;
				}

				return {
					...record,
					isNewDay,
				};
			});
	}, [tripData]);

	const parentRef = useRef<HTMLDivElement>(null); // 滾動容器的 ref

	const rowVirtualizer = useVirtualizer({
		count: processedRecords?.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: (index) => {
			if (!processedRecords) {
				return CARD_HEIGHT;
			}

			const record = processedRecords[index];
			if (record && record.isNewDay) {
				return CARD_HEIGHT + SEPARATOR_HEIGHT;
			}

			return CARD_HEIGHT;
		},
		overscan: 5,
	});

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

	return (
		<div
			ref={parentRef}
			className='space-y-3'
			style={{
				height: `calc(100vh - 200px)`,
				overflow: 'auto',
			}}
		>
			{processedRecords?.length && (
				<div
					style={{
						height: `${rowVirtualizer.getTotalSize()}px`, // 內容的總高度，撐開滾動條
						width: '100%',
						position: 'relative',
					}}
				>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => {
						const record = processedRecords[virtualItem.index]; // 取得對應的資料
						return (
							<div
								key={record.id}
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									width: '100%',
									transform: `translateY(${virtualItem.start}px)`, // 將項目定位到正確的位置
								}}
							>
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
										<p className='font-bold text-lg text-gray-800'>
											{record.name}
										</p>
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
						);
					})}
				</div>
			)}
		</div>
	);
};
