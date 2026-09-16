'use client';

import { useContext, useMemo, useRef, useEffect, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import type { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { recordToInput } from '@/app/lib/tripApi/recordInput';
import { defaultRecordFilters, filterRecords, prepareRecordRows } from '@/app/lib/recordList';
import { useRecordListPosition } from '@/app/lib/useRecordListPosition';
import { RecordFilters } from '@/app/components/RecordFilters';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { RecordCard } from '@/app/components/RecordCard';
import { RecordDetails } from '@/app/components/RecordDetails';

export function RecordList({ onEdit, isActive }: { onEdit: (record: Record) => void; isActive: boolean }) {
	const context = useContext(SingleTripContext);
	const showHistory = context?.showHistory ?? false;
	const { queries: { useTrip }, mutations: { useUpdateRecord } } = useGraphQLClient();
	const { data: tripData, loading, error, refetch } = useTrip(context?.tripId || '', showHistory);
	const [updateRecord] = useUpdateRecord(context?.tripId || '');
	const [deleteError, setDeleteError] = useState('');
	const [deleting, setDeleting] = useState(false);
	const deletingRef = useRef(false);
	const [recordToDelete, setRecordToDelete] = useState<Record | null>(null);
	const [detailRecord, setDetailRecord] = useState<Record | null>(null);
	const detailTrigger = useRef<HTMLButtonElement | null>(null);
	const [filters, setFilters] = useState(defaultRecordFilters);
	const records = tripData?.records;
	const rows = useMemo(() => prepareRecordRows(filterRecords(records ?? [], filters)), [records, filters]);
	const members = useMemo(() => {
		const all = new Map((tripData?.addresses ?? []).map(address => [address.id, address]));
		for (const record of records ?? []) for (const address of [record.prePayAddress, ...record.shouldPayAddress]) {
			if (address.id && !all.has(address.id)) all.set(address.id, address);
		}
		return [...all.values()];
	}, [tripData?.addresses, records]);
	const resetKey = JSON.stringify([filters.query.trim().toLowerCase(), filters.memberId, filters.memberId ? filters.role : 'related', showHistory]);
	const { parentRef, virtualizer: rowVirtualizer, capture, restoringView } = useRecordListPosition(rows, isActive, resetKey);

	useEffect(() => {
		if (!isActive) { setDetailRecord(null); setRecordToDelete(null); }
	}, [isActive]);

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
			setDeleteError(error instanceof Error ? error.message : '刪除失敗，請重試。');
		} finally {
			deletingRef.current = false;
			setDeleting(false);
		}
	};
	const closeDetails = () => {
		setDetailRecord(null);
		requestAnimationFrame(() => {
			const target = detailTrigger.current;
			(target?.isConnected ? target : parentRef.current)?.focus({ preventScroll: true });
		});
	};

	if (!context) return null;
	if (!tripData) return <div className='mt-12 text-center text-gray-600' role='status'>
		{error ? <>載入失敗。<button className='underline' onClick={retry}>重試</button></> : loading ? '載入中…' : '找不到旅程。'}
	</div>;

	return <div className='flex min-h-0 flex-1 flex-col gap-3'>
		<RecordFilters filters={filters} onChange={setFilters} members={members} isActive={isActive} />
		{error && <p role='alert' className='text-sm text-red-700'>更新失敗。<button className='underline' onClick={retry}>重試</button></p>}
		{!records?.length && <p className='mt-12 text-center text-gray-600'>{showHistory ? '沒有歷史帳目' : '尚無帳目，到「記帳」分頁開始記帳'}</p>}
		{!!records?.length && !rows.length && <div role='status' className='mt-12 text-center text-gray-600'>
			<p>沒有符合條件的帳目</p>
			<button type='button' onClick={() => setFilters(defaultRecordFilters)} className='min-h-11 px-3 text-blue-700 underline'>清除篩選</button>
		</div>}
		<div ref={parentRef} onScroll={capture} role='region' aria-label='帳目列表' tabIndex={-1} className='min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]'>
			<div role='list' aria-label='帳目' className='relative w-full' style={{ height: rowVirtualizer.getTotalSize() }}>
				{rowVirtualizer.getVirtualItems().map(item => {
					const { record, separator } = rows[item.index];
					return <div key={item.key} role='listitem' aria-posinset={item.index + 1} aria-setsize={rows.length} data-index={item.index} data-row-id={record.id} ref={rowVirtualizer.measureElement}
						className='absolute top-0 left-0 w-full pb-3' style={{ transform: `translateY(${item.start}px)`, visibility: restoringView ? 'hidden' : undefined }}>
						{separator && <div className={`flex h-11 items-center gap-3 text-xs font-medium ${record.isValid ? 'text-gray-600' : 'text-amber-700'}`}>
							<span className='flex-1 border-t border-gray-300' /><span>{separator}</span><span className='flex-1 border-t border-gray-300' />
						</div>}
						<RecordCard record={record} deleting={deleting} onEdit={onEdit}
							onDetails={(selected, trigger) => { detailTrigger.current = trigger; setDetailRecord(structuredClone(selected)); }}
							onDelete={selected => { setDeleteError(''); setRecordToDelete(structuredClone(selected)); }} />
					</div>;
				})}
			</div>
		</div>
		<RecordDetails record={detailRecord} onClose={closeDetails} />
		<ConfirmModal isOpen={!!recordToDelete} title='刪除帳目'
			message={`確定刪除「${recordToDelete?.name ?? ''}」？刪除後仍會保留在歷史紀錄。`}
			onConfirm={handleDeleteConfirm} busy={deleting} error={deleteError}
			onCancel={() => { setRecordToDelete(null); setDeleteError(''); }}
			confirmText='Delete' cancelText='取消' isDestructive />
	</div>;
}
