'use client';
import { authErrorClassName } from './AuthFeedback';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth, useLoginDialog } from '@/app/context/AuthProvider';
export function AuthControls({ beforeLogin }: { beforeLogin?: () => void }) {
	const auth = useAuth();
	const open = useLoginDialog();
	return <div className='space-y-2 text-sm'>
		<button type='button' disabled={auth.status === 'exchanging'} onClick={() => {
			if (auth.status === 'authenticated') auth.logout();
			else { beforeLogin?.(); open(); }
		}} className='flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50'>
			{auth.status === 'authenticated' ? <LogOut size={18} aria-hidden /> : <LogIn size={18} aria-hidden />}
			{auth.status === 'authenticated' ? '登出' : '登入'}
		</button>
		{auth.storageWarning && <p role='status'>{auth.storageWarning}</p>}
		{auth.error && <div role='alert' className={authErrorClassName}><p>{auth.error}</p>{auth.refreshToken && <button className='underline' onClick={() => void auth.refresh()}>重試刷新</button>}</div>}
	</div>;
}
