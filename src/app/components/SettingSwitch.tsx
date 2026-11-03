import { InputHTMLAttributes } from 'react';
export function SettingSwitch(props: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			{...props}
			type='checkbox'
			role='switch'
			className='relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors checked:bg-blue-600 before:absolute before:left-1 before:top-1 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40'
		/>
	);
}
