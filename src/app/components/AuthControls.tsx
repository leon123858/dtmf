'use client';

import { useAuth } from '@/app/context/AuthProvider';
export function AuthControls() {
	const auth = useAuth();
	return (
		<div className='space-y-2 text-sm'>
			<button
				type='button'
				disabled={auth.status === 'exchanging'}
				onClick={
					auth.status === 'authenticated'
						? auth.logout
						: () => {
								auth.login('google');
							}
				}
				className='rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50'
			>
				{auth.status === 'authenticated'
					? '登出'
					: auth.status === 'exchanging'
						? '登入中…'
						: '使用 Google 登入'}
			</button>
			<p className='text-xs opacity-80'>重新整理頁面後需重新登入</p>
			{auth.refreshing && <p role='status'>正在更新登入狀態…</p>}
			{auth.error && (
				<div role='alert'>
					<p>{auth.error}</p>
					{auth.refreshToken && (
						<button
							type='button'
							onClick={() => void auth.refresh()}
							className='mt-2 underline'
						>
							重試刷新
						</button>
					)}
				</div>
			)}
		</div>
	);
}
