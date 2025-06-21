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
		</div>
	);
}
