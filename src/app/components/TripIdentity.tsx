'use client';
import { OperationFeedback } from '@/app/components/OperationFeedback';

import { useContext, useId, useRef, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useMember } from '@/app/context/MemberProvider';
import { useAuth, useLoginDialog } from '@/app/context/AuthProvider';
import { useCreateAddress } from '@/app/lib/tripApi/hooks';
import { validateName } from '@/app/lib/utils';
import { MyError } from '@/app/lib/errors';
import { ModalDialog } from './ModalDialog';

export function TripIdentity() {
	const context = useContext(SingleTripContext)!;
	const member = useMember();
	const auth = useAuth();
	const login = useLoginDialog();
	const create = useCreateAddress(context.tripId);
	const [open, setOpen] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const [mode, setMode] = useState('existing');
	const [addressId, setAddressId] = useState('');
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);
	const labelId = useId();
	const { binding, loading, error: bindingError } = context.binding;
	const run = async (operation: () => Promise<void>) => {
		if (pending.current) return;
		const departingPrivateTrip = leaving && context.trip.data?.private === true;
		pending.current = true; setBusy(true); setError(''); setSaved(false);
		try {
			await operation();
			if (departingPrivateTrip) context.revoke(new MyError('FORBIDDEN'));
			try { await context.synchronize(); }
			catch { setSaved(true); setError('已儲存，資料更新失敗，請重試。'); }
			setOpen(false); setLeaving(false);
		} catch (cause) {
			const failure = cause instanceof Error ? cause : new Error('旅程身分更新失敗。');
			context.revoke(failure);
			const conflict = 'code' in failure && failure.code === 'CONFLICT';
			setError(conflict
				? leaving && context.trip.data?.private ? '私有旅程最後一名成員不能離開，請先到旅程設定改回公開。'
					: mode === 'new' ? '暱稱已存在，請換一個名稱。' : '這個分帳成員已被綁定，請改選其他成員。'
				: failure.message);
		} finally { pending.current = false; setBusy(false); }
	};
	const submit = () => {
		if (mode === 'new') {
			if (name || !member.user?.name) { const validation = validateName(name); if (validation) { setError(validation); return; } }
			void run(() => create.execute({ input: name ? { name } : {}, bindToMe: true }));
		} else if (mode === 'existing') {
			if (!addressId) { setError('請選擇分帳成員。'); return; }
			void run(() => member.bind(context.tripId, addressId));
		} else void run(() => member.bind(context.tripId));
	};
	const ready = member.status === 'ready' && !loading && !bindingError && binding !== undefined;
	const button = 'rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50';
	return <section className='mb-4 space-y-3 rounded-lg bg-white p-4 shadow' aria-label='我的旅程身分'>
		<h2 className='text-lg font-bold'>我的旅程身分</h2>
		{auth.status !== 'authenticated' ? <><p>登入後可加入旅程並設定自己的分帳身分。</p><button className={button} onClick={login}>登入</button></>
			: member.status === 'error' ? <><p role='alert'>會員載入失敗。</p><button onClick={() => void member.retry()}>重試載入會員</button></>
				: bindingError ? <><p role='alert'>{bindingError.message}</p><button onClick={() => void context.binding.refresh().catch(() => { })}>重試載入旅程身分</button></>
					: !ready ? <p role='status'>旅程身分載入中...</p>
						: <><p>{binding ? binding.address ? `我的分帳身分：${context.trip.data?.addresses.find(address => address.id === binding.address?.id)?.name ?? binding.address.name}` : '已加入，尚未設定分帳身分' : '尚未加入旅程'}</p>
							<div className='flex flex-wrap gap-3'>
								<button className={button} disabled={busy || member.pending > 0} onClick={() => { setError(''); setSaved(false); setMode('existing'); setAddressId(binding?.address?.id ?? ''); setName(''); setOpen(true); }}>{binding ? '設定分帳身分' : '加入旅程'}</button>
								{binding && <button className='text-red-700' disabled={busy || member.pending > 0} onClick={() => { setError(''); setSaved(false); setLeaving(true); }}>離開旅程</button>}
							</div>
						</>}
		{error && !open && !leaving && <p role='alert' className='text-red-700'>{error}</p>}
		{saved && <button disabled={busy} onClick={() => { setBusy(true); void context.synchronize().then(() => { setSaved(false); setError(''); }).catch(() => { }).finally(() => setBusy(false)); }}>重試更新資料</button>}
		<ModalDialog isOpen={open || leaving} onClose={() => { setOpen(false); setLeaving(false); }} busy={busy} labelId={labelId} className='m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-4 rounded-xl bg-white p-5 text-gray-800 backdrop:bg-black/50'>
			{(open || leaving) && <>
				<h2 id={labelId} className='text-xl font-bold'>{leaving ? '離開旅程？' : '設定我的旅程身分'}</h2>
				{leaving ? <p>離開不會刪除分帳成員或取消收藏。若這是私有旅程，離開後將無法存取。</p> : <fieldset disabled={busy} className='space-y-4'>
					<label className='block'><input type='radio' name={labelId} checked={mode === 'existing'} onChange={() => setMode('existing')} /> 選擇既有分帳成員</label>
					{mode === 'existing' && <label className='block'>分帳成員<select aria-label='分帳成員' className='mt-1 w-full rounded border p-2' value={addressId} onChange={event => setAddressId(event.target.value)}><option value=''>請選擇</option>{context.trip.data?.addresses.map(address => <option key={address.id} value={address.id}>{address.name}</option>)}</select></label>}
					{!binding?.address && <label className='block'><input type='radio' name={labelId} checked={mode === 'new'} onChange={() => setMode('new')} /> 新增自己的分帳成員</label>}
					{mode === 'new' && <label className='block'>新成員暱稱<input className='mt-1 w-full rounded border p-2' value={name} onChange={event => setName(event.target.value)} placeholder={member.user?.name ? '留空使用個人名稱' : '請輸入暱稱'} /></label>}
					<label className='block'><input type='radio' name={labelId} checked={mode === 'none'} onChange={() => setMode('none')} /> {binding?.address ? '取消分帳身分，保留加入資格' : '只加入旅程，暫不對應分帳成員'}</label>
				</fieldset>}
				{error && <p role='alert' className='text-red-700'>{error}</p>}
				{leaving && error && context.trip.data?.private && <button disabled={busy} className='underline' onClick={() => { setLeaving(false); context.setSettingsOpen(true); }}>前往隱私設定</button>}
				<div className='flex gap-3'><button className={button} disabled={busy || member.pending > 0} onClick={() => leaving ? void run(() => member.unbind(context.tripId)) : submit()}><OperationFeedback pending={busy}>{busy ? '處理中...' : leaving ? '確認離開' : '確認'}</OperationFeedback></button><button disabled={busy} onClick={() => { setOpen(false); setLeaving(false); }}>取消</button></div>
			</>}
		</ModalDialog>
	</section>;
}
