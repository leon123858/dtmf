import { useContext, useId } from 'react';
import { SingleTripContext } from '../context/SingleTripProvider';
import { ModalDialog } from './ModalDialog';
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
 const context = useContext(SingleTripContext);
 const labelId = useId();
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
 <ModalDialog isOpen={isOpen} onClose={() => setIsOpen(false)} labelId={labelId}
 className='fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-80 max-w-[85vw] bg-gray-800 text-white p-6 backdrop:bg-black/50 overflow-y-auto'>
				<div className='flex justify-between items-center mb-10'>
					<h2 id={labelId} className='text-2xl font-bold'>選單</h2>
					<button
						onClick={() => setIsOpen(false)}
						aria-label='Close menu' autoFocus className='p-2 rounded-full hover:bg-gray-700'
					>
						<ArrowLeftEndOnRectangleIcon className='h-6 w-6' />
					</button>
				</div>
				<p className='mb-6 break-words [overflow-wrap:anywhere] font-semibold'>{name}</p>
				<nav>
					<ul>
						{navItems.map((item, index) => (
							<li
								key={index}
								className='mb-2'
 ><button type='button' className='w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 text-left'
								onClick={() => {
									item.func();
									setIsOpen(false);
								}}
							>
								{item.icon}
								<span className='text-lg'>{item.text}</span>
 </button>
							</li>
						))}
					</ul>
				</nav>
 {context && <label className='mt-6 border-t border-gray-600 pt-5 flex items-center justify-between gap-3 cursor-pointer'>
 <span className='text-sm'>Record history 🕰️<span className='block text-xs text-gray-300 mt-1'>Include old versions and deleted records</span></span>
 <input type='checkbox' role='switch' aria-label='Record history' checked={context.showHistory} onChange={event => context.setShowHistory(event.target.checked)} className='h-5 w-5 shrink-0 accent-blue-500' />
 </label>}
 </ModalDialog>
 <div className='flex flex-1 min-w-0 items-center gap-2'>
				<button
					onClick={() => {
						setIsOpen(!isOpen);
					}}
					aria-label='Open menu' aria-expanded={isOpen} className='shrink-0 text-gray-700 text-2xl font-bold rounded-lg hover:bg-gray-300 flex h-11 w-11 items-center justify-center transition-all duration-300'
				>
					<Bars3BottomLeftIcon className='h-6 w-6' />
				</button>
				<h1 className='min-w-0 text-xl leading-7 font-bold text-gray-800 line-clamp-2 [overflow-wrap:anywhere]'>{name}</h1>
			</div>
		</>
	);
};
