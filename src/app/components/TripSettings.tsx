'use client';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useUpdateTrip } from '@/app/lib/tripApi/hooks';
import { useAuth, useLoginDialog } from '@/app/context/AuthProvider';
import { useMember } from '@/app/context/MemberProvider';
import { ModalDialog } from './ModalDialog';

export function TripSettings({ open, close }: { open: boolean; close: () => void }) {
	const context = useContext(SingleTripContext)!;
	const auth = useAuth();
	const login = useLoginDialog();
	const member = useMember();
	const update = useUpdateTrip();
	const labelId = useId();
	const [confirm, setConfirm] = useState(false);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	useEffect(() => { if (open) { setConfirm(false); setError(''); setSaved(false); } }, [open]);
	const save = async () => {
		if (pending.current) return;
		pending.current = true; setBusy(true); setError('');
		try {
			await update.execute({ tripId: context.tripId, input: { private: !context.trip.data?.private } });
			setConfirm(false); setSaved(true);
			try { await context.synchronize(); close(); }
			catch { setError('已儲存，資料更新失敗，請重試。'); }
		} catch (cause) { setError(cause instanceof Error ? cause.message : '隱私設定更新失敗。'); }
		finally { pending.current = false; setBusy(false); }
	};
	const joined = member.status === 'ready' && !context.binding.loading && !context.binding.error && !!context.binding.binding;
	return <ModalDialog isOpen={open} onClose={close} busy={busy} labelId={labelId} className='m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-4 rounded-xl bg-white p-5 text-gray-800 backdrop:bg-black/50'>
		<h2 id={labelId} className='text-xl font-bold'>旅程設定</h2>
		<p>目前為{context.trip.data?.private ? '私有' : '公開'}旅程。</p>
		{auth.status !== 'authenticated' ? <button onClick={() => { close(); login(); }}>登入後設定隱私</button>
			: !joined ? <><p>需先加入旅程才能設定隱私。請到成員分頁的「我的旅程身分」加入。</p>{context.binding.error && <button onClick={() => void context.binding.refresh().catch(() => { })}>重試載入旅程身分</button>}</>
				: !saved && <>
					<button disabled={busy || member.pending > 0} className='rounded bg-blue-600 p-3 text-white disabled:opacity-50' onClick={() => setConfirm(true)}>{context.trip.data?.private ? '改為公開旅程' : '改為私有旅程'}</button>
					{confirm && <div className='space-y-3 rounded border border-amber-300 bg-amber-50 p-3'>
						<p>{context.trip.data?.private ? '改為公開後，知道旅程連結的人皆可查看與修改。' : '切換後，只有已加入此旅程的帳號可以查看及修改。僅收藏旅程的人不會取得存取權。目前無邀請功能，新帳號將無法自行加入。'}</p>
						<p>所有已加入的成員皆可修改旅程隱私。</p>
						<button disabled={busy} onClick={() => void save()} className='rounded bg-blue-600 p-2 text-white'>{busy ? '儲存中...' : '確認切換'}</button>
					</div>}
				</>}
		{error && <p role='alert' className='text-red-700'>{error}</p>}
		{saved && error && <button disabled={busy} onClick={() => { setBusy(true); void context.synchronize().then(close).catch(() => { }).finally(() => setBusy(false)); }}>重試更新資料</button>}
		<button className='block rounded border border-gray-300 px-3 py-2' disabled={busy} onClick={close}>關閉</button>
	</ModalDialog>;
}
