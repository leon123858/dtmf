'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';
import { createTripAction } from '@/app/lib/staticActions/tripActions';

export const TripCreationForm: React.FC = () => {
	const { pending } = useFormStatus();

	return (
		<form
			action={createTripAction}
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
				{pending && (
					<svg
						className='animate-spin -ml-1 mr-3 h-5 w-5 text-white'
						xmlns='http://www.w3.org/2000/svg'
						fill='none'
						viewBox='0 0 24 24'
					>
						<circle
							className='opacity-25'
							cx='12'
							cy='12'
							r='10'
							stroke='currentColor'
							strokeWidth='4'
						></circle>
						<path
							className='opacity-75'
							fill='currentColor'
							d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
						></path>
					</svg>
				)}
				<span>{pending ? '建立中...' : '開始分帳'}</span>
			</button>
		</form>
	);
};
