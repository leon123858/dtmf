'use client';

import { useRef, useState } from 'react';
import { useMember } from '@/app/context/MemberProvider';
import { useAuth, useLoginDialog } from '@/app/context/AuthProvider';
import { Header } from '@/app/components/SimpleHeader';
import { validateName } from '@/app/lib/utils';
import { authStore } from '@/app/lib/auth/store';

export default function ProfilePage() {
	const auth = useAuth();
	const login = useLoginDialog();
	const member = useMember();
	return <div className='min-h-dvh bg-gray-100 text-gray-800'><div className='mx-auto max-w-lg p-4'>
		<Header name='個人資料' />
		{auth.status !== 'authenticated' ? <button onClick={login} className='rounded bg-blue-600 p-3 text-white'>登入後編輯個人資料</button>
			: member.status === 'error' ? <div role='alert'>個人資料載入失敗。<button onClick={() => void member.retry()}>重試</button></div>
				: member.status !== 'ready' || !member.user ? <p role='status'>載入中...</p>
					: <ProfileEditor key={`${authStore.getSession()}:${member.user.id}`} />}
	</div></div>;
}

function ProfileEditor() {
	const member = useMember();
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const name = draft ?? member.user?.name ?? '';
	const refresh = async () => {
		try {
			await member.refreshAccount();
			setSaved(false);
			setError('');
			setNotice('個人資料已儲存。');
		} catch {
			setSaved(true);
			setError('已儲存，資料更新失敗，請重試。');
		}
	};
	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (pending.current || saved) return;
		const validation = validateName(name);
		if (validation) { setError(validation); return; }
		pending.current = true;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			await member.updateProfile({ name });
			setDraft(null);
			await refresh();
		} catch (cause) { setError(cause instanceof Error ? cause.message : '儲存失敗，請重試。'); }
		finally { pending.current = false; setBusy(false); }
	};
	return <form onSubmit={save} className='space-y-5 rounded-lg bg-white p-4 shadow'>
		<label className='block'>個人名稱<input className='mt-2 w-full rounded border p-3' value={name} onChange={event => { setDraft(event.target.value); setNotice(''); }} disabled={busy || saved || member.pending > 0} /></label>
		<p className='text-sm text-gray-600'>未使用旅程暱稱時，分帳成員將顯示此名稱。更新名稱也會更新已綁定旅程中的顯示名稱，包含歷史帳目。</p>
		<div><span className='block font-semibold'>Email</span><p className='break-all'>{member.user?.email ?? '登入帳號未提供電子郵件'}</p></div>
		{error && <p role='alert' className='text-red-700'>{error}</p>}
		<p role='status'>{notice}</p>
		{saved && <button type='button' disabled={busy} className='underline' onClick={() => { setBusy(true); void refresh().finally(() => setBusy(false)); }}>重試更新資料</button>}
		<button className='rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50' disabled={busy || saved || member.pending > 0 || name === (member.user?.name ?? '')}>{busy ? '儲存中...' : '儲存'}</button>
	</form>;
}
