'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import type { Record } from '@/app/lib/types';
import { RecordCategory } from '@/app/lib/tripApi/types';
import { recordStatuses } from '@/app/lib/recordList';
import { ModalDialog } from '@/app/components/ModalDialog';

const splitLabels: { [category in RecordCategory]: string } = {
	NORMAL: '均分', FIX: '按金額', PART: '按份數',
	FIX_BEFORE_NORMAL: '指定金額後均分', TRANSFER: '自動還款',
};

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 20 });

// Display the recorded configuration in member order, including zero values.
// A negative fixed-before-normal value means a fixed amount without remainder sharing.
function memberSplitDescription(record: Record, index: number) {
	if (record.category === RecordCategory.NORMAL) return '參與均分';
	const value = record.extendPayMsg[index];
	if (value === undefined || !Number.isFinite(value)) return '分攤設定未提供';
	switch (record.category) {
		case RecordCategory.FIX: return `分攤 $${formatNumber(value)}`;
		case RecordCategory.PART: return `${formatNumber(value)} 份`;
		case RecordCategory.TRANSFER: return `收款 $${formatNumber(value)}`;
		case RecordCategory.FIX_BEFORE_NORMAL:
			return value === 0 ? '僅參與剩餘均分' :
				`指定 $${formatNumber(Math.abs(value))}・${value < 0 ? '不參與剩餘均分' : '另參與剩餘均分'}`;
		default: return '分攤設定未提供';
	}
}

export function RecordDetails({ record, onClose }: { record: Record | null; onClose: () => void }) {
	const labelId = useId();
	return <ModalDialog isOpen={!!record} onClose={onClose} labelId={labelId} className='m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-4 backdrop:bg-black/50'>
		<div className='sticky -top-4 z-10 -mx-4 -mt-4 flex items-center justify-between gap-2 bg-white px-4 pt-4 pb-2'>
			<h2 id={labelId} className='text-lg font-semibold'>帳目詳情</h2>
			<button type='button' autoFocus aria-label='關閉詳情' onClick={onClose} className='flex h-11 w-11 items-center justify-center rounded hover:bg-gray-100'><X size={20} aria-hidden='true' /></button>
		</div>
		{record && <dl className='space-y-4 text-gray-900 [overflow-wrap:anywhere]'>
			<div><dt className='text-sm text-gray-600'>項目名稱</dt><dd className='font-semibold whitespace-pre-wrap'>{record.name}</dd></div>
			<div><dt className='text-sm text-gray-600'>金額</dt><dd className='text-xl tabular-nums'>${formatNumber(record.amount)}</dd></div>
			<div><dt className='text-sm text-gray-600'>付款人</dt><dd>{record.prePayAddress.name}</dd></div>
			<div><dt className='text-sm text-gray-600'>分攤方式</dt><dd>{splitLabels[record.category] ?? '未知分攤方式'}</dd></div>
			<div>
				<dt className='text-sm text-gray-600'>{record.category === RecordCategory.TRANSFER ? '收款成員' : '分攤成員'}（{record.shouldPayAddress.length}）</dt>
				<dd><ul className='mt-1 divide-y divide-gray-200'>{record.shouldPayAddress.map((address, index) => <li key={address.id} className='py-2'>
					<p>{address.name}</p>
					<p className='text-sm tabular-nums text-gray-600'>{memberSplitDescription(record, index)}</p>
				</li>)}</ul></dd>
			</div>
			<div><dt className='text-sm text-gray-600'>日期</dt><dd>{new Date(Number(record.time)).toLocaleString()}</dd></div>
			<div><dt className='text-sm text-gray-600'>狀態</dt><dd>{recordStatuses(record).join('、') || '有效帳目'}</dd></div>
		</dl>}
	</ModalDialog>;
}
