import { LoaderCircle } from 'lucide-react';

export const authErrorClassName = 'rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800 whitespace-pre-wrap [overflow-wrap:anywhere]';

export function AuthWaiting({ children }: { children: React.ReactNode }) {
	return <p role='status' className='flex min-h-6 items-center gap-2 text-sm text-slate-600'>
		<LoaderCircle size={18} aria-hidden className='shrink-0 animate-spin motion-reduce:animate-none' />
		{children}
	</p>;
}
