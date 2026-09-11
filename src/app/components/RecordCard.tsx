'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Clock3, Ellipsis, Pencil, Trash2, TriangleAlert, Users, Wallet } from 'lucide-react';
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
			<div className='flex items-start gap-1'>
				<button type='button' aria-label={`查看 ${record.name}`} onClick={event => onDetails(record, event.currentTarget)}
					className='min-h-11 min-w-0 flex-1 text-left rounded focus-visible:outline-2 focus-visible:outline-blue-600'>
					<span data-record-title className={`line-clamp-2 text-base leading-6 font-semibold [overflow-wrap:anywhere] ${historical ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{record.name}</span>
				</button>
				{recordStatuses(record).map(status => {
					const Icon = status === '無效帳目' ? TriangleAlert : status === '已刪除' ? Trash2 : Clock3;
					return <span key={status} role='img' aria-label={status} title={status} className={`mt-3 shrink-0 ${status === '無效帳目' ? 'text-amber-700' : 'text-gray-600'}`}><Icon size={16} aria-hidden='true' /></span>;
				})}
				{!historical && <RecordActions record={record} deleting={deleting} onEdit={onEdit} onDelete={onDelete} />}
			</div>
			<p data-record-amount className='mt-1 text-lg leading-7 font-semibold tabular-nums text-gray-900 [overflow-wrap:anywhere]'>${record.amount.toLocaleString()}</p>
			<div className='mt-2 flex min-w-0 items-center gap-3 text-sm leading-5 text-gray-600'>
				<span className='flex min-w-0 flex-1 items-center gap-1.5'><Wallet size={16} className='shrink-0' aria-hidden='true' /><span className='sr-only'>付款人：</span><span className='truncate'>{record.prePayAddress.name}</span></span>
				<span className='flex shrink-0 items-center gap-1.5'><Users size={16} aria-hidden='true' /><span className='sr-only'>分攤人數：</span>{record.shouldPayAddress.length}</span>
			</div>
		</article>
	);
}

function RecordActions({ record, deleting, onEdit, onDelete }: Pick<RecordCardProps, 'record' | 'deleting' | 'onEdit' | 'onDelete'>) {
	const id = useId();
	const popover = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const [expanded, setExpanded] = useState(false);
	useEffect(() => {
		const close = () => popover.current?.hidePopover();
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
		return () => {
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('resize', close);
		};
	}, []);
	return <>
		<button ref={trigger} type='button' aria-label={`更多操作 ${record.name}`} aria-haspopup='menu' aria-expanded={expanded} popoverTarget={id}
			className='flex h-11 w-11 shrink-0 items-center justify-center rounded text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-600'
			onClick={() => {
				const rect = trigger.current!.getBoundingClientRect();
				setPosition({ left: Math.max(8, Math.min(rect.right - 144, window.innerWidth - 152)), top: rect.bottom + 100 > window.innerHeight ? rect.top - 100 : rect.bottom });
			}}><Ellipsis size={20} aria-hidden='true' /></button>
		<div ref={popover} id={id} popover='auto' role='menu' aria-label={`${record.name} 操作`} style={position}
			className='fixed m-0 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg'
			onToggle={event => {
				setExpanded(event.newState === 'open');
				if (event.newState === 'open') popover.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
			}}
			onKeyDown={event => {
				if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
					event.preventDefault();
					const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
					const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
					buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
				}
				if (event.key === 'Tab') popover.current?.hidePopover();
			}}>
			<button type='button' role='menuitem' aria-label={`Edit ${record.name}`} className='flex min-h-11 w-full items-center gap-2 rounded px-3 text-sm text-gray-800 hover:bg-gray-100 focus:bg-gray-100' onClick={() => { popover.current?.hidePopover(); onEdit(record); }}><Pencil size={16} aria-hidden='true' />編輯</button>
			<button type='button' role='menuitem' aria-label={`Delete ${record.name}`} disabled={deleting} className='flex min-h-11 w-full items-center gap-2 rounded px-3 text-sm text-red-700 hover:bg-red-50 focus:bg-red-50 disabled:opacity-50' onClick={() => { popover.current?.hidePopover(); onDelete(record); }}><Trash2 size={16} aria-hidden='true' />刪除</button>
		</div>
	</>;
}
