'use client';
import { OperationFeedback } from '@/app/components/OperationFeedback';


import React from 'react';
import { authStore } from '../lib/auth/store';
import { createTripAction } from '@/app/lib/staticActions/tripActions';

export const TripCreationForm: React.FC = () => {
	const [pending, setPending] = React.useState(false);
	const submitting = React.useRef(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting.current) return;
		const formData = new FormData(event.currentTarget);
		submitting.current = true;
		setPending(true);
		let navigating = false;
		try {
			const session = authStore.getSession();
			const token = await authStore.getValidIdToken();
			if (session !== authStore.getSession()) throw new Error('auth');
			if (authStore.getSnapshot().status === 'authenticated' && !token) throw new Error('auth');
			let result = await createTripAction(formData, token ?? undefined);
			if (result.unauthenticated && token && session === authStore.getSession()) {
				const refreshed = authStore.getSnapshot().idToken !== token || await authStore.refreshAuthToken();
				const retryToken = refreshed ? await authStore.getValidIdToken() : null;
				if (retryToken && session === authStore.getSession()) result = await createTripAction(formData, retryToken);
			}
			if (result.error !== undefined) {
				window.alert(result.error);
			} else {
				// Reload so normal member initialization reads the backend-created favorite.
				navigating = true;
				window.location.assign(`/trip/${result.tripId}`);
			}
		} catch {
			window.alert('創建新旅程失敗，請稍後再試。');
		} finally {
			submitting.current = false;
			if (!navigating) setPending(false);
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className='bg-white p-8 rounded-xl shadow-lg'
		>
			<h2 className='text-2xl font-semibold text-gray-700 mb-6'>
				建立一個新旅程
			</h2>
			<input
				type='text'
				name='tripName'
				placeholder='例如: 2024 日本關西之旅'
				className='w-full p-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
				required
				disabled={pending}
			/>
			<button
				type='submit'
				className={`
					w-full py-3 px-4 rounded-lg shadow-md transition-all duration-300 mt-6 text-lg
					font-bold flex items-center justify-center space-x-2
					${
						pending
							? 'bg-blue-300 cursor-not-allowed' // Pending 狀態的背景色和鼠標樣式
							: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 text-white transform active:scale-98 hover:shadow-lg'
					}
				`}
				disabled={pending}
			>

				<span><OperationFeedback pending={pending}>{pending ? '建立中...' : '開始分帳'}</OperationFeedback></span>
			</button>
		</form>
	);
};
