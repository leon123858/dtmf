'use client';

import { ChevronRight, Clock3, Pencil, Trash2, TriangleAlert, Users, Wallet } from 'lucide-react';
import type { Record } from '@/app/lib/types';
import { recordStatuses } from '@/app/lib/recordList';

interface RecordCardProps {
	record: Record;
	deleting: boolean;
	onDetails: (record: Record, trigger: HTMLButtonElement) => void;
	onEdit: (record: Record) => void;
	onDelete: (record: Record) => void;
}

export function RecordCard({ record, deleting, onDetails, onEdit, onDelete }: RecordCardProps) {
	const historical = record.isDeleted || !record.isActive;
	return (
		<article data-record-id={record.id} className={`rounded-lg border p-3 ${historical ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white shadow-sm'}`}>
			<div className='flex items-center gap-3'>
				<div className='min-w-0 flex-1'>
					<div className='flex items-start gap-1'>
						<h3 data-record-title className={`line-clamp-2 min-w-0 flex-1 text-base leading-6 font-semibold [overflow-wrap:anywhere] ${historical ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{record.name}</h3>
						{recordStatuses(record).map(status => {
							const Icon = status === '無效帳目' ? TriangleAlert : status === '已刪除' ? Trash2 : Clock3;
							return <span key={status} role='img' aria-label={status} title={status} className={`mt-0.5 shrink-0 ${status === '無效帳目' ? 'text-amber-700' : 'text-gray-600'}`}><Icon size={16} aria-hidden='true' /></span>;
						})}
					</div>
					<p data-record-amount className='mt-1 text-lg leading-7 font-semibold tabular-nums text-gray-900 [overflow-wrap:anywhere]'>${record.amount.toLocaleString()}</p>
					<div className='mt-2 flex min-w-0 items-center gap-3 text-sm leading-5 text-gray-600'>
						<span className='flex min-w-0 flex-1 items-center gap-1.5'><Wallet size={16} className='shrink-0' aria-hidden='true' /><span className='sr-only'>付款人：</span><span className='truncate'>{record.prePayAddress.name}</span></span>
						<span className='flex shrink-0 items-center gap-1.5'><Users size={16} aria-hidden='true' /><span className='sr-only'>分攤人數：</span>{record.shouldPayAddress.length}</span>
					</div>
				</div>
				
				<button type='button' aria-label={`查看 ${record.name}`} onClick={event => onDetails(record, event.currentTarget)}
					className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600'>
					<ChevronRight size={24} aria-hidden='true' />
				</button>
			</div>

			{!historical && (
				<div className='mt-3 flex gap-2 pt-1'>
					<button type='button' aria-label={`編輯 ${record.name}`} onClick={() => onEdit(record)}
						className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-50 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600'>
						<Pencil size={16} aria-hidden='true' />
						<span>編輯</span>
					</button>
					<button type='button' aria-label={`刪除 ${record.name}`} onClick={() => onDelete(record)} disabled={deleting}
						className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 py-3 text-sm font-medium text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50'>
						<Trash2 size={16} aria-hidden='true' />
						<span>刪除</span>
					</button>
				</div>
			)}
		</article>
	);
}
