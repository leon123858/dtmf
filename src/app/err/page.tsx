import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';

// @ts-expect-error: searchParams is embedded by Next.js
export default async function CustomErrPage({ searchParams }) {
	const msg = searchParams?.errMsg || '發生未知錯誤，請稍後再試。';

	return (
		<div className='bg-slate-50 min-h-screen flex flex-col items-center justify-center p-4'>
			<div className='w-full max-w-md text-center'>
				<h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
					發生錯誤
				</h1>
				<p className='text-lg text-gray-500 mb-8'>{msg}</p>
				<Link
					href='/'
					className='inline-flex items-center justify-center gap-2 text-indigo-600 hover:text-indigo-800 font-semibold p-2 rounded-lg hover:bg-slate-200 transition-colors'
				>
					<ArrowLeftIcon className='w-5 h-5' />
					<span>返回首頁</span>
				</Link>
			</div>
		</div>
	);
}
