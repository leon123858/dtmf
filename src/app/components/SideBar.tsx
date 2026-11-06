import { useContext, useId, useRef } from 'react';
import { SingleTripContext } from '../context/SingleTripProvider';
import { useAuth } from '../context/AuthProvider';
import { TripSettings } from './TripSettings';
import { AuthControls } from './AuthControls';
import { ModalDialog } from './ModalDialog';
import Link from 'next/link';
import { LinkPending } from './LinkPending';
import {
	Bars3BottomLeftIcon,
	ArrowLeftEndOnRectangleIcon,
	HomeIcon,
	DocumentDuplicateIcon,
	QuestionMarkCircleIcon,
	ArchiveBoxArrowDownIcon,
	Cog6ToothIcon,
	UserCircleIcon,
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
	const menuButton = useRef<HTMLButtonElement>(null);
	const auth = useAuth();

	const context = useContext(SingleTripContext);
	const labelId = useId();
	const navItems: { icon: React.ReactNode; text: string; href?: string; func?: () => void }[] = [
		...(auth.status === 'authenticated'
			? [
					{
						icon: <UserCircleIcon className='h-6 w-6' />,
						text: '個人資料',
						href: '/profile',
					},
				]
			: []),
		{
			icon: <HomeIcon className='h-6 w-6' />,
			text: '首頁',
			href: '/',
		},
		{
			icon: <ArchiveBoxArrowDownIcon className='h-6 w-6' />,
			text: '歷史紀錄',
			href: '/history',
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
		...(context
			? [
					{
						icon: <Cog6ToothIcon className='h-6 w-6' />,
						text: '旅程設定',
						func: () => context.setSettingsOpen(true),
					},
				]
			: []),
	];

	return (
		<>
			<ModalDialog
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				labelId={labelId}
				className='fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-80 max-w-[85vw] bg-gray-800 text-white p-6 backdrop:bg-black/50 overflow-y-auto'
			>
				<div className='flex min-h-full flex-col'>
					<div className='flex justify-between items-center mb-10'>
						<h2 id={labelId} className='text-2xl font-bold'>
							選單
						</h2>
						<button
							onClick={() => setIsOpen(false)}
							aria-label='Close menu'
							autoFocus
							className='p-2 rounded-full hover:bg-gray-700'
						>
							<ArrowLeftEndOnRectangleIcon className='h-6 w-6' />
						</button>
					</div>
					<p className='mb-6 break-words [overflow-wrap:anywhere] font-semibold'>
						{name}
					</p>
					<nav>
						<ul>
							{navItems.map((item, index) => (
								<li key={index} className='mb-2'>
									{item.href ? <Link href={item.href} className='w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 text-left' onClick={() => { if (item.href === window.location.pathname) setIsOpen(false); }}>
                                        {item.icon}<span className='text-lg'>{item.text}</span><LinkPending />
                                    </Link> : <button
										type='button'
										className='w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 text-left'
										onClick={() => {
											item.func?.();
											setIsOpen(false);
										}}
									>
										{item.icon}
										<span className='text-lg'>{item.text}</span>
									</button>}
								</li>
							))}
						</ul>
					</nav>
					<div className='mt-auto pt-6'>
						<div className='border-t border-gray-600 pt-5'>
							<AuthControls beforeLogin={() => setIsOpen(false)} />
						</div>
					</div>
				</div>
			</ModalDialog>
			{context && (
				<TripSettings
					open={context.settingsOpen}
					close={() => {
						context.setSettingsOpen(false);
						requestAnimationFrame(() => menuButton.current?.focus());
					}}
				/>
			)}
			<div className='flex flex-1 min-w-0 items-center gap-2'>
				<button
					onClick={() => {
						setIsOpen(!isOpen);
					}}
					ref={menuButton}
					aria-label='Open menu'
					aria-expanded={isOpen}
					className='shrink-0 text-gray-700 text-2xl font-bold rounded-lg hover:bg-gray-300 flex h-11 w-11 items-center justify-center transition-all duration-300'
				>
					<Bars3BottomLeftIcon className='h-6 w-6' />
				</button>
				<h1 className='min-w-0 text-xl leading-7 font-bold text-gray-800 line-clamp-2 [overflow-wrap:anywhere]'>
					{name}
				</h1>
			</div>
		</>
	);
};
