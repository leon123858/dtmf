'use client';
import { LinkPending } from '@/app/components/LinkPending';
import Link from 'next/link';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import { useAuth } from '../context/AuthProvider';
export function HomeProfileLink() {
	const auth = useAuth();
	return auth.status === 'authenticated' ? (
		<Link
			href='/profile'
			className='flex items-center justify-center gap-2 text-slate-600 font-semibold p-2 rounded-lg hover:bg-slate-200 transition-colors'
		>
			<UserCircleIcon aria-hidden className='w-5 h-5' />
			<span>個人資料</span>
		<LinkPending /></Link>
	) : null;
}
