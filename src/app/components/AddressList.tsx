'use client';
import { OperationFeedback } from '@/app/components/OperationFeedback';

import { useContext, useRef, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useCreateAddress, useUpdateAddress, useDeleteAddress } from '@/app/lib/tripApi/hooks';
import { validateName } from '@/app/lib/utils';
import { AddressEditDialog } from './AddressEditDialog';
import { TripIdentity } from './TripIdentity';

export const AddressList = () => {
	const context = useContext(SingleTripContext)!;
	const trip = context.trip.data;
	const create = useCreateAddress(context.tripId);
	const update = useUpdateAddress(context.tripId);
	const remove = useDeleteAddress(context.tripId);
	const [adding, setAdding] = useState(false);
	const [newName, setNewName] = useState('');
	const [editing, setEditing] = useState<{ id: string; name: string; useNickname: boolean } | null>(null);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
 const editTrigger = useRef<HTMLButtonElement | null>(null);
	if (!trip) return null;
	const run = async (operation: () => Promise<void>, refresh = false, operationKind: 'write' | 'delete' = 'write') => {
		if (pending.current) return;
		pending.current = true; setBusy(true); setError(''); setSaved(false);
		try {
			await operation();
			if (refresh) {
				try { await context.synchronize(); }
				catch { setEditing(null); setAdding(false); setSaved(true); setError('已儲存，資料更新失敗，請重試。'); return; }
			}
			setEditing(null); setAdding(false); setNewName('');
		} catch (cause) {
			const conflict = cause instanceof Error && 'code' in cause && cause.code === 'CONFLICT';
			setError(conflict ? operationKind === 'delete' ? '此成員已被帳號綁定或被帳目引用，無法移除。' : '暱稱已存在，請換一個名稱。' : cause instanceof Error ? cause.message : '成員操作失敗，請重試。');
		}
		finally { pending.current = false; setBusy(false); setDeletingId(null); }
	};
	const save = () => {
		if (!editing) return;
		if (editing.name) { const validation = validateName(editing.name); if (validation) { setError(validation); return; } }
		void run(() => update.execute({ addressId: editing.id, input: { useNickname: editing.useNickname, ...(editing.name ? { name: editing.name } : {}) } }), true);
	};
	return <>
		<TripIdentity />
		<section aria-label='成員列表' className='space-y-4 rounded-lg bg-white p-4 shadow-md'>
			<h2 className='text-xl font-bold text-gray-800'>成員列表</h2>
			{error && !editing && <p role='alert' className='text-red-700'>{error}</p>}
			{saved && <button disabled={busy} onClick={() => { setBusy(true); void context.synchronize().then(() => { setSaved(false); setError(''); }).catch(() => { }).finally(() => setBusy(false)); }}>重試更新資料</button>}
			{trip.addresses.map(address => <div key={address.id} className='space-y-3 rounded bg-gray-50 p-3 text-gray-800'>
				<div className='flex items-center justify-between gap-2'>
					<span className='min-w-0 flex-1 break-words'>{address.name} {context.binding.binding?.address?.id === address.id && <span className='rounded bg-blue-100 px-2 text-sm text-blue-700'>我</span>}</span>
					<button className='shrink-0 text-blue-700' disabled={busy} onClick={event => { editTrigger.current = event.currentTarget; setEditing({ id: address.id, name: '', useNickname: !!address.useNickname }); setError(''); }}>名稱設定</button>
					<button className='text-red-700' disabled={busy} onClick={() => { setDeletingId(address.id); void run(() => remove.execute({ addressId: address.id }), false, 'delete'); }}><OperationFeedback pending={busy && deletingId === address.id}>移除</OperationFeedback></button>
				</div>

			</div>)}
			{adding ? <fieldset disabled={busy} className='space-y-3'>
				<label className='block'>新成員名稱<input autoFocus className='mt-1 w-full rounded border p-2' placeholder='輸入新成員名稱' value={newName} onChange={event => setNewName(event.target.value)} /></label>
				<div className='flex gap-4'><button onClick={() => { const validation = validateName(newName); if (validation) { setError(validation); return; } void run(() => create.execute({ input: { name: newName } })); }}><OperationFeedback pending={busy}>{busy ? '新增中...' : '新增'}</OperationFeedback></button><button onClick={() => setAdding(false)}>取消</button></div>
			</fieldset> : <button disabled={busy} onClick={() => setAdding(true)} className='w-full rounded-lg bg-blue-100 px-4 py-2 font-semibold text-blue-700'>新增成員</button>}
				{editing && <AddressEditDialog returnFocus={editTrigger.current} error={error} onClose={() => setEditing(null)} busy={busy}><fieldset disabled={busy} className='space-y-3'>
					<p className='text-sm'>目前顯示名稱：{trip.addresses.find(address => address.id === editing.id)?.name}</p>
					<label className='block'><input type='checkbox' checked={editing.useNickname} onChange={event => setEditing({ ...editing, useNickname: event.target.checked })} /> 固定使用旅程暱稱</label>
					<label className='block'>設定新旅程暱稱<input autoFocus className='mt-1 w-full rounded border p-2' value={editing.name} placeholder='留空保留原有暱稱' onChange={event => setEditing({ ...editing, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(null); }} /></label>
					<p className='text-xs text-gray-600'>關閉固定暱稱時，已綁定且有個人名稱的成員會顯示個人名稱。名稱變更也會套用於歷史帳目。</p>
					<div className='flex gap-4'><button className='text-blue-700' onClick={save}><OperationFeedback pending={busy}>{busy ? '儲存中...' : '儲存'}</OperationFeedback></button><button onClick={() => setEditing(null)}>取消</button></div>
				</fieldset></AddressEditDialog>}
		</section>
	</>;
};
