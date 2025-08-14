import { TripCreationForm } from '@/app/components/TripCreateForm';

export const metadata = {
	title: '旅遊分帳 | 輕鬆分攤旅途開銷',
	description:
		'力量兔兔為您帶來輕鬆、公平的旅遊分帳工具。告別複雜的計算，享受無憂的旅行！作為力量兔兔的一個實用小工具，它將幫助您更便捷地管理旅途開銷。',
	keywords:
		'旅遊分帳, 旅行費用分攤, 旅費計算, 團體旅行開銷, 輕鬆分帳, 力量兔兔, 力量兔兔工具, 力量兔兔分帳',
	openGraph: {
		title: '旅遊分帳 | 輕鬆分攤旅途開銷',
		description:
			'力量兔兔為您帶來輕鬆、公平的旅遊分帳工具。告別複雜的計算，享受無憂的旅行！作為力量兔兔的一個實用小工具，它將幫助您更便捷地管理旅途開銷。',
		url: 'https://powerbunny.page',
		siteName: '旅遊分帳工具',
		images: [
			{
				url: 'https://powerbunny.page/android-chrome-512x512.png',
				width: 512,
				height: 512,
				alt: '旅遊分帳工具預覽圖',
			},
		],
		locale: 'zh_TW',
		type: 'website',
	},
};

export default async function HomePage() {
	return (
		<div className='bg-gray-100 min-h-screen flex flex-col items-center justify-center p-4'>
			<div className='w-full max-w-md text-center'>
				<h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
					旅遊分帳
				</h1>
				<p className='text-lg text-gray-600 mb-8'>
					輕鬆、公平地分攤旅途中的每一筆花費
					<br />
					<span className='text-sm text-gray-400'>
						這是<strong>力量兔兔</strong>為您提供的便捷工具。
					</span>
				</p>
				<TripCreationForm />
			</div>
			<br className='w-full border-t border-gray-300 my-8' />
			<footer className='w-full py-5 text-center text-sm text-gray-500'>
				<p className='mb-2'>這是一個開源專案，歡迎一同貢獻與改善。</p>
				<a
					href='https://github.com/leon123858/dtmf'
					target='_blank'
					rel='noopener noreferrer'
					className='inline-flex items-center justify-center gap-2 text-indigo-600 hover:underline'
				>
					<svg
						className='w-5 h-5'
						fill='currentColor'
						viewBox='0 0 24 24'
						aria-hidden='true'
					>
						<path
							fillRule='evenodd'
							d='M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.168 6.839 9.492.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.378.203 2.398.1 2.651.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.001 10.001 0 0022 12c0-5.523-4.477-10-10-10z'
							clipRule='evenodd'
						/>
					</svg>
					<span>GitHub</span>
				</a>
			</footer>
		</div>
	);
}
