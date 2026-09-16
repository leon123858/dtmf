'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { Address } from '@/app/lib/tripApi/types';
import { defaultRecordFilters, memberRoleLabels, type MemberRole, type RecordFilters as Filters } from '@/app/lib/recordList';
import { ModalDialog } from './ModalDialog';

export function RecordFilters({ filters, onChange, members, isActive }: {
	filters: Filters; onChange: (filters: Filters) => void; members: Address[]; isActive: boolean;
}) {
	const labelId = useId();
	const [draft, setDraft] = useState<Filters | null>(null);
	useEffect(() => { if (!isActive) setDraft(null); }, [isActive]);
	const selected = members.find(member => member.id === filters.memberId);
	const summary = filters.memberId ? `${selected?.name ?? '已移除成員'}・${memberRoleLabels[filters.role]}` : '成員';
	return <>
		<div className='flex h-11 shrink-0 gap-2' role='search' aria-label='篩選帳目'>
			<div className='relative min-w-0 flex-1'>
				<input aria-label='搜尋項目名稱' placeholder='搜尋項目名稱…' type='text' value={filters.query}
					onChange={event => onChange({ ...filters, query: event.target.value })}
					className='h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white pl-3 pr-11 text-base text-gray-900' />
				{filters.query && <button type='button' aria-label='清除搜尋' onClick={() => onChange({ ...filters, query: '' })}
					className='absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-gray-600'><X size={18} aria-hidden='true' /></button>}
			</div>
			<button type='button' aria-label={`成員篩選：${summary}`} aria-haspopup='dialog'
				onClick={() => setDraft({ ...filters })}
				className={`flex h-11 max-w-[45%] shrink-0 items-center gap-1 rounded-lg border px-3 text-sm ${filters.memberId ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700'}`}>
				<span className='truncate'>{filters.memberId ? selected?.name ?? '已移除成員' : '成員'}</span>
				{filters.memberId && <span className='shrink-0'>・{memberRoleLabels[filters.role]}</span>}
				<ChevronDown size={16} className='shrink-0' aria-hidden='true' />
			</button>
		</div>
		<ModalDialog isOpen={isActive && !!draft} onClose={() => setDraft(null)} labelId={labelId}
			className='fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 backdrop:bg-black/50'>
			<div className='mb-3 flex items-center justify-between'>
				<h2 id={labelId} className='text-lg font-semibold'>成員篩選</h2>
				<button type='button' autoFocus aria-label='關閉成員篩選' onClick={() => setDraft(null)} className='flex h-11 w-11 items-center justify-center'><X size={20} aria-hidden='true' /></button>
			</div>
			{draft && <form onSubmit={event => { event.preventDefault(); onChange(draft); setDraft(null); }} className='space-y-4'>
				<div>
					<label htmlFor={`${labelId}-member`} className='block text-sm'>成員</label>
					<select id={`${labelId}-member`} value={draft.memberId ?? ''} onChange={event => setDraft({ ...draft, memberId: event.target.value || null, role: event.target.value ? draft.role : 'related' })}
						className='mt-1 h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-base'>
						<option value=''>全部成員</option>
						{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
						{draft.memberId && !members.some(member => member.id === draft.memberId) && <option value={draft.memberId}>已移除成員</option>}
					</select>
				</div>
				{draft.memberId && <fieldset>
					<legend className='mb-1 text-sm'>角色</legend>
					<div className='flex gap-2'>{(Object.keys(memberRoleLabels) as MemberRole[]).map(role => <label key={role}
						className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border text-sm ${draft.role === role ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300'}`}>
						<input type='radio' name={labelId} value={role} checked={draft.role === role} onChange={() => setDraft({ ...draft, role })} className='accent-blue-600' />
						{memberRoleLabels[role]}
					</label>)}</div>
				</fieldset>}
				<div className='flex gap-2'>
					<button type='button' onClick={() => setDraft({ ...draft, memberId: defaultRecordFilters.memberId, role: defaultRecordFilters.role })} className='min-h-11 flex-1 rounded-lg bg-gray-100'>重設</button>
					<button type='submit' className='min-h-11 flex-1 rounded-lg bg-blue-600 text-white'>套用</button>
				</div>
			</form>}
		</ModalDialog>
	</>;
}
