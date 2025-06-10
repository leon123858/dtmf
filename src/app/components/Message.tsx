// components/Message.tsx
import type { FC, HTMLAttributes, ReactNode } from 'react';
import { cva, VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

// 使用 cva 定義組件的樣式變體
const messageVariants = cva(
	// 基礎樣式：設定為 fixed，定位在右上角，並加上 z-index 和陰影
	'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex w-[80vw] max-w-2xl items-start gap-3 rounded-lg border p-4 text-sm shadow-lg transition-all duration-300 ease-in-out',
	{
		variants: {
			variant: {
				success: 'border-green-200 bg-green-50 text-green-800',
				error: 'border-red-200 bg-red-50 text-red-800',
				warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
				info: 'border-blue-200 bg-blue-50 text-blue-800',
			},
		},
		defaultVariants: {
			variant: 'info',
		},
	}
);

// 定義 Icon 的對應關係
const icons = {
	success: <CheckCircle2 className='h-5 w-5' />,
	error: <AlertCircle className='h-5 w-5' />,
	warning: <AlertTriangle className='h-5 w-5' />,
	info: <AlertCircle className='h-5 w-5' />,
};

// 定義組件的 Props
interface MessageProps
	extends HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof messageVariants> {
	children: ReactNode;
	onClose?: () => void;
	showClose?: boolean;
	isShow?: boolean; // 是否顯示消息
}

const Message: FC<MessageProps> = ({
	className,
	variant,
	children,
	onClose,
	showClose = false,
	isShow = false,
	...props
}) => {
	const Icon = variant ? icons[variant] : null;

	return (
		isShow && (
			<div
				role='alert'
				className={messageVariants({ variant, className })}
				{...props}
			>
				{Icon && <div className='flex-shrink-0'>{Icon}</div>}
				<div className='flex-1'>{children}</div>
				{showClose && (
					<button
						type='button'
						onClick={onClose}
						className='ml-auto flex-shrink-0 p-0.5'
						aria-label='close'
					>
						<X className='h-4 w-4' />
					</button>
				)}
			</div>
		)
	);
};

export { Message, messageVariants };
