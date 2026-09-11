'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import type { Record } from '@/app/lib/types';
import { recordStatuses } from '@/app/lib/recordList';
import { ModalDialog } from '@/app/components/ModalDialog';

export function RecordDetails({ record, onClose }: { record: Record | null; onClose: () => void }) {
	const labelId = useId();
	return <ModalDialog isOpen={!!record} onClose={onClose} labelId={labelId} className='m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-4 backdrop:bg-black/50'>
		<div className='flex items-center justify-between gap-2'>
			<h2 id={labelId} className='text-lg font-semibold'>帳目詳情</h2>
			<button type='button' autoFocus aria-label='關閉詳情' onClick={onClose} className='flex h-11 w-11 items-center justify-center rounded hover:bg-gray-100'><X size={20} aria-hidden='true' /></button>
		</div>
		{record && <dl className='space-y-4 text-gray-900 [overflow-wrap:anywhere]'>
			<div><dt className='text-sm text-gray-600'>項目名稱</dt><dd className='font-semibold whitespace-pre-wrap'>{record.name}</dd></div>
			<div><dt className='text-sm text-gray-600'>金額</dt><dd className='text-xl tabular-nums'>${record.amount.toLocaleString()}</dd></div>
			<div><dt className='text-sm text-gray-600'>付款人</dt><dd>{record.prePayAddress.name}</dd></div>
			<div><dt className='text-sm text-gray-600'>分攤成員（{record.shouldPayAddress.length}）</dt><dd><ul>{record.shouldPayAddress.map(address => <li key={address.id}>{address.name}</li>)}</ul></dd></div>
			<div><dt className='text-sm text-gray-600'>日期</dt><dd>{new Date(Number(record.time)).toLocaleString()}</dd></div>
			<div><dt className='text-sm text-gray-600'>狀態</dt><dd>{recordStatuses(record).join('、') || '有效帳目'}</dd></div>
		</dl>}
	</ModalDialog>;
}
