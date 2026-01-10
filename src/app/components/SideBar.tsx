import { useRouter } from 'next/navigation';
import {
	Bars3BottomLeftIcon,
	ArrowLeftEndOnRectangleIcon,
	HomeIcon,
	DocumentDuplicateIcon,
	QuestionMarkCircleIcon,
	ArchiveBoxArrowDownIcon,
} from '@heroicons/react/24/solid';

export interface SideBarProps {
	isOpen: boolean;
	setIsOpen: (b: boolean) => void;
	name: string;
}

export const SideBar: React.FC<SideBarProps> = ({
	isOpen,
	setIsOpen,
	name,
}) => {
	const router = useRouter();
	const navItems = [
		{
			icon: <HomeIcon className='h-6 w-6' />,
			text: '首頁',
			func: () => router.push('/'),
		},
		{
			icon: <ArchiveBoxArrowDownIcon className='h-6 w-6' />,
			text: '瀏覽歷史',
			func: () => router.push('/history'),
		},
		{
			icon: <DocumentDuplicateIcon className='h-6 w-6' />,
			text: '專案',
			func: () => {
				window.open('https://github.com/leon123858/dtmf', '_blank');
			},
		},
		{
			icon: <QuestionMarkCircleIcon className='h-6 w-6' />,
			text: '提案',
			func: () => {
				window.open('https://forms.gle/RJgDWsx2wCrha3TN8', '_blank');
			},
		},
	];

	return (
		<>
			{isOpen && (
				<div
					className='fixed inset-0 bg-opacity-50 z-40'
					onClick={() => setIsOpen(false)}
				></div>
			)}
			<div
				className={`fixed top-0 left-0 h-full w-1/2 bg-gray-800 text-white p-6 z-50 transform transition-transform duration-300 ease-in-out ${
					isOpen ? 'translate-x-0' : '-translate-x-[101%]'
				}`}
			>
				<div className='flex justify-between items-center mb-10'>
					<h2 className='text-2xl font-bold'>選單</h2>
					<button
						onClick={() => setIsOpen(false)}
						className='p-2 rounded-full hover:bg-gray-700'
					>
						<ArrowLeftEndOnRectangleIcon className='h-6 w-6' />
					</button>
				</div>
				<nav>
					<ul>
						{navItems.map((item, index) => (
							<li
								key={index}
								className='flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-700 cursor-pointer mb-2'
								onClick={() => {
									item.func();
									setIsOpen(false);
								}}
							>
								{item.icon}
								<span className='text-lg'>{item.text}</span>
							</li>
						))}
					</ul>
				</nav>
			</div>
			<div className='flex items-center space-x-3'>
				<button
					onClick={() => {
						setIsOpen(!isOpen);
					}}
					className='text-gray-700 text-2xl font-bold rounded-lg hover:bg-gray-300 p-2 transition-all duration-300'
				>
					<Bars3BottomLeftIcon className='h-8 w-8' />
				</button>
				<h1 className='text-3xl font-bold text-gray-800 truncate'>{name}</h1>
			</div>
		</>
	);
};
