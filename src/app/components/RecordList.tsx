'use client';

import React, { useContext, useMemo, useRef, useEffect, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { recordToInput } from '../lib/tripApi/recordInput';
import { ConfirmModal } from './ConfirmModal';

interface RecordListProps {
	onEdit: (record: Record) => void;
}

// Estimated height
const CARD_HEIGHT = 115;
const SEPARATOR_HEIGHT = 50;

export const RecordList: React.FC<RecordListProps> = ({ onEdit }) => {
	const [deleteError, setDeleteError] = useState('');
 const [deleting, setDeleting] = useState(false);
 const deletingRef = useRef(false);
	const [recordToDelete, setRecordToDelete] = useState<Record | null>(null);

	const {
		queries: { useTrip },
		mutations: { useUpdateRecord },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const showHistory = context?.showHistory ?? false;
 const { data: tripData, loading, error, refetch } = useTrip(context?.tripId || '', showHistory);
	const [updateRecord] =
		useUpdateRecord(context?.tripId || '');

	const processedRecords = useMemo(() => {
		if (!tripData || !tripData.records) return null;

		let nextDate: number = 0;

		const inValidRecords = tripData.records.filter((record) => !record.isValid);
		const validRecords = tripData.records.filter((record) => record.isValid);

		const formattedInValidRecords = inValidRecords
			.map((record) => ({
				...record,
				date: Number(record.time),
				isNewDay: false,
			}))
			.sort((a, b) => {
				if (b.date === a.date) {
					return a.name.localeCompare(b.name);
				}
				return a.date - b.date;
			});
		if (formattedInValidRecords.length > 0) {
			formattedInValidRecords[0].isNewDay = true;
		}
		const formattedValidRecords = validRecords
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
				d.setHours(0, 0, 0, 0); // Normalize date to start of day
				const currentDayStart = d.getTime();

				const isNewDay = currentDayStart >= nextDate;
				if (isNewDay) {
					// Set nextDate to start of next day
					nextDate = currentDayStart + 24 * 60 * 60 * 1000;
				}

				return {
					...record,
					isNewDay,
				};
			});
		return [...formattedInValidRecords, ...formattedValidRecords];
	}, [tripData]);

	const parentRef = useRef<HTMLDivElement>(null); // Scroll container ref

	const rowVirtualizer = useVirtualizer({
		count: processedRecords?.length || 0,
 getItemKey: index => processedRecords?.[index].id ?? index,
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

	useEffect(() => {
		rowVirtualizer.measure();
	}, [processedRecords, rowVirtualizer]);

 const retry = () => { void refetch().catch(() => {}); };
 const handleDeleteConfirm = async () => {
  if (!recordToDelete || !context || deletingRef.current) return;
  deletingRef.current = true;
  setDeleting(true);
  setDeleteError('');
  try {
   const old = recordToInput(recordToDelete);
   await updateRecord({ variables: { recordId: recordToDelete.id, input: { old, new: { ...old, isDeleted: true } } } });
   setRecordToDelete(null);
  } catch (error) {
   setDeleteError(error instanceof Error ? error.message : 'Delete failed. Please try again. ⚠️');
  } finally {
   deletingRef.current = false;
   setDeleting(false);
  }
 };
 if (!context) return null;
 if (!tripData) return <div className='text-center text-gray-500 mt-12' role='status'>
  {error ? <>Loading failed. ⚠️ <button className='underline' onClick={retry}>Retry 🔄</button></> : loading ? 'Loading… ⏳' : 'Trip not found.'}
 </div>;

	return (
		<div className='flex flex-col space-y-3'>
 {error && <p role='alert' className='text-red-600 text-sm'>Refresh failed. ⚠️ <button className='underline' onClick={retry}>Retry 🔄</button></p>}
 {!tripData.records.length && <p className='text-center text-gray-500 mt-12'>{showHistory ? 'No history records found. 🕰️' : "No records yet, click 'Add' to start! ✨"}</p>}
			<div
				ref={parentRef}
				style={{
					height: `calc(100dvh - 200px)`,
					overflow: 'auto',
				}}
			>
			{!!processedRecords?.length && (
				<div
					style={{
						height: `${rowVirtualizer.getTotalSize()}px`, // Total content height for scrollbar
						width: '100%',
						position: 'relative',
					}}
				>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => {
						const record = processedRecords[virtualItem.index]; // Get corresponding data
						return (
							<div
								key={virtualItem.key}
 data-index={virtualItem.index}
 ref={rowVirtualizer.measureElement}
 className="pb-3"
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									width: '100%',
									transform: `translateY(${virtualItem.start}px)`, // Position items
								}}
							>
								{record.isNewDay &&
									(record.isValid ? (
										<div className='flex items-center my-4'>
											<div className='flex-grow border-t border-gray-300'></div>
											<span className='mx-4 text-gray-600 text-sm font-semibold'>
												{new Date(record.date).toLocaleDateString()}
											</span>
											<div className='flex-grow border-t border-gray-300'></div>
										</div>
									) : (
										<div className='flex items-center my-4'>
											<div className='flex-grow border-t border-red-200'></div>
											<span className='mx-4 text-red-500 text-sm font-semibold'>
												Invalid Record ⚠️
											</span>
											<div className='flex-grow border-t border-red-200'></div>
										</div>
									))}
								<div className={`p-4 rounded-lg shadow-md flex items-center justify-between ${record.isDeleted || !record.isActive ? 'bg-gray-100 opacity-60' : 'bg-white'}`}>
									<div className='flex-1 min-w-0 [overflow-wrap:anywhere]'>
										<p className={`font-bold text-lg ${record.isDeleted || !record.isActive ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
											{!record.isValid && '[Invalid ⚠️] '} {record.isDeleted ? '[Deleted 🗑️] ' : !record.isActive ? '[Old Version 🕒] ' : ''} {record.name}
										</p>
										<p className='text-sm text-gray-500 mt-1'>
											Paid by {longStringSimplify(record.prePayAddress.name)} $
											{record.amount.toLocaleString()} 💸
										</p>
										<p className='text-sm text-gray-500 mt-1'>
											Split between: 👥{' '}
											{longStringSimplify(
												record.shouldPayAddress
													.map((addr) => longStringSimplify(addr.name))
													.join(', '),
												20
											)}
										</p>
									</div>
									<div className='flex shrink-0 space-x-1'>
										{!record.isDeleted && record.isActive && (
											<>
												<button
													aria-label={`Edit ${record.name}`} onClick={() => onEdit(record)}
													className='text-blue-500 hover:text-blue-700 p-2'
												>
													✏️
												</button>
												<button
													aria-label={`Delete ${record.name}`} onClick={() => { setDeleteError(''); setRecordToDelete(structuredClone(record)); }}
													disabled={deleting}
													className='text-red-500 hover:text-red-700 p-2'
												>
													🗑️
												</button>
											</>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
			</div>
			
			<ConfirmModal
				isOpen={!!recordToDelete}
				title="Delete Record 🗑️"
				message={`Are you sure you want to delete the record "${recordToDelete?.name}"? It will be marked as deleted and kept in history. 🕰️`}
				onConfirm={handleDeleteConfirm}
				busy={deleting}
 error={deleteError}
 onCancel={() => { setRecordToDelete(null); setDeleteError(''); }}
				confirmText="Delete"
				cancelText="Cancel"
				isDestructive={true}
			/>
		</div>
	);
};
