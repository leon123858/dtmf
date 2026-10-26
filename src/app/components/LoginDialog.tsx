'use client';
import { useId, useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { authRestClient } from '../lib/auth/store';
import { authStore } from '../lib/auth/store';
export function LoginDialog({ open, close }: { open: boolean; close: () => void }) {
	const label = useId();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	return <ModalDialog isOpen={open} onClose={close} busy={busy} labelId={label} className='m-auto w-80 max-w-[90vw] rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/50'>
		<h2 id={label} className='text-xl font-bold mb-4'>登入</h2>
		<div className='flex flex-col gap-3'>
			{(['google', 'github'] as const).map(provider => <button key={provider} disabled={busy} className='rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50' onClick={() => { setBusy(true); authRestClient.loginRedirect(provider); }}>使用 {provider === 'google' ? 'Google' : 'GitHub'} 登入</button>)}
			{process.env.E2E_FRONTEND_ENABLE === 'true' && <button disabled={busy} onClick={async () => {
				setBusy(true); setError('');
				await authStore.loginWith(authRestClient.passwordLogin);
				setBusy(false);
				if (authStore.getSnapshot().status === 'authenticated') close();
				else setError('測試登入失敗，請確認後端設定後重試。');
			}}>測試登入</button>}
			{busy && <p role='status'>登入中…</p>}
			{error && <p role='alert'>{error}</p>}
			<button disabled={busy} onClick={close} className='p-3'>取消</button>
		</div>
	</ModalDialog>;
}
