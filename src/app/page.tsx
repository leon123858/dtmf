import { TripCreationForm } from '@/app/components/TripCreateForm'; // 導入新的客戶端組件

export default async function HomePage() {
	return (
		<div className='bg-gray-100 min-h-screen flex flex-col items-center justify-center p-4'>
			<div className='w-full max-w-md text-center'>
				<h1 className='text-4xl md:text-5xl font-bold text-gray-800 mb-4'>
					旅遊分帳
				</h1>
				<p className='text-lg text-gray-600 mb-8'>
					輕鬆、公平地分攤旅途中的每一筆花費。
				</p>
				<TripCreationForm /> {/* 渲染客戶端組件 */}
			</div>
		</div>
	);
}
