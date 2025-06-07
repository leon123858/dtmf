// app/page.js - 這將是我們的首頁 Server Component
// 無需 'use client' 指令，因為它不再處理客戶端狀態或事件

import { createTripAction } from './lib/tripActions'; // 導入 Server Action

// ---
export const metadata = {
	title: '旅遊分帳應用 | 輕鬆建立旅程',
	description: '輕鬆、公平地分攤旅途中的每一筆花費。快速建立新旅程並開始分帳。',
};

export default async function HomePage() {
	// Server Component 不會有 useState, useEffect, useRouter 等 Hook
	// 頁面內容會在伺服器端完全渲染，有利於 SEO

	return (
		<div className='bg-gray-100 min-h-screen flex flex-col items-center justify-center p-4'>
			<div className='w-full max-w-md text-center'>
				<h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
					旅遊分帳
				</h1>
				<p className='text-lg text-gray-600 mb-8'>
					輕鬆、公平地分攤旅途中的每一筆花費。
				</p>

				<form
					// 直接將 Server Action 函數賦給 form 的 action 屬性
					action={createTripAction}
					className='bg-white p-8 rounded-xl shadow-lg'
				>
					<h2 className='text-2xl font-semibold text-gray-700 mb-6'>
						建立一個新旅程
					</h2>
					<input
						type='text'
						name='tripName' // **關鍵：設置 name 屬性，Server Action 會通過這個 name 獲取值**
						placeholder='例如：2024 日本關西之旅'
						className='w-full p-3 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
						required
					/>
					<button
						type='submit'
						className='w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 mt-6 text-lg'
					>
						開始分帳
					</button>
				</form>
			</div>
		</div>
	);
}
