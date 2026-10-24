'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authRestClient } from '@/app/lib/auth/authRestClient';
import { errorMessage } from '@/app/lib/error';
import { authStore } from '@/app/lib/auth/store';

export function AuthComplete() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let active = true;
		const callback = authRestClient.readLoginOAuthCallback();
		if (callback.error !== null) setError(errorMessage(callback.error));
		else if (!callback.code) setError('無效登入連結，請重新登入。');
		else
			void authStore.getAuthToken(callback.code).then((result) => {
				if (!active) return;
				if (result && authStore.getSnapshot().status === 'authenticated')
					router.replace(result.returnTo || '/');
				else
					setError(authStore.getSnapshot().error ?? '登入已結束，請重新登入。');
			});
		return () => {
			active = false;
		};
	}, [router]);
	return (
		<main className='min-h-dvh flex items-center justify-center bg-slate-50 p-6'>
			<div className='max-w-md rounded-xl bg-white p-8 shadow space-y-4'>
				<h1 className='text-xl font-bold'>Google 登入</h1>
				{error ? (
					<>
						<p role='alert'>{error}</p>
						<button
							onClick={() => {
								authRestClient.loginRedirect('google');
							}}
							className='rounded-lg bg-blue-600 px-4 py-2 text-white'
						>
							重新登入
						</button>
					</>
				) : (
					<p role='status'>正在完成登入…</p>
				)}
			</div>
		</main>
	);
}
