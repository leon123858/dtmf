'use client';
import { useId, useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaGithub } from 'react-icons/fa';
import { authErrorClassName, AuthWaiting } from './AuthFeedback';

import { ModalDialog } from './ModalDialog';
import { authRestClient } from '../lib/auth/store';
import { authStore } from '../lib/auth/store';

const buttonClassName = 'flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export function LoginDialog({ open, close }: { open: boolean; close: () => void }) {
	const label = useId();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	return <ModalDialog isOpen={open} onClose={close} busy={busy} labelId={label} className='m-auto w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/60'>
		<h2 id={label} className='mb-6 text-2xl font-bold'>登入</h2>
		<div className='flex flex-col gap-3'>
			{(['google', 'github'] as const).map(provider => <button key={provider} disabled={busy} className={`${buttonClassName} ${provider === 'google' ? 'border-slate-300 bg-white text-slate-800 enabled:hover:bg-slate-50' : 'border-slate-900 bg-slate-900 text-white enabled:hover:bg-slate-800'}`} onClick={() => { setBusy(true); authRestClient.loginRedirect(provider); }}>{provider === 'google' ? <FcGoogle size={22} aria-hidden className='shrink-0' /> : <FaGithub size={22} aria-hidden className='shrink-0' />}使用 {provider === 'google' ? 'Google' : 'GitHub'} 登入</button>)}
			{process.env.E2E_FRONTEND_ENABLE === 'true' && <button className={`${buttonClassName} border-slate-200 bg-white text-slate-600 enabled:hover:bg-slate-50`} disabled={busy} onClick={async () => {
				setBusy(true); setError('');
				await authStore.loginWith(authRestClient.passwordLogin);
				setBusy(false);
				if (authStore.getSnapshot().status === 'authenticated') close();
				else setError(authStore.getSnapshot().error ?? '測試登入失敗，請確認後端設定後重試。');
			}}>測試登入</button>}
			<div className='min-h-6'>{busy && <AuthWaiting>登入中…</AuthWaiting>}</div>
			{error && <p role='alert' className={authErrorClassName}>{error}</p>}
			<button disabled={busy} onClick={close} className={`${buttonClassName} border-slate-200 bg-slate-100 text-slate-700 enabled:hover:bg-slate-200`}>取消</button>
		</div>
	</ModalDialog>;
}
