import React, { useId } from 'react';
import { ModalDialog } from './ModalDialog';

interface ConfirmModalProps {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
	confirmText?: string;
	cancelText?: string;
	isDestructive?: boolean;
 busy?: boolean;
 error?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
	isOpen,
	title,
	message,
	onConfirm,
	onCancel,
	confirmText = 'Confirm',
	cancelText = 'Cancel',
	isDestructive = false,
 busy = false,
 error,
}) => {
	const labelId = useId();

	return (
		<ModalDialog isOpen={isOpen} onClose={onCancel} busy={busy} labelId={labelId} className='m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg p-0 backdrop:bg-black/50'>
			<div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
				<div className="p-6">
					<h3 id={labelId} className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
					<p className="text-sm text-gray-500 break-words [overflow-wrap:anywhere]">{message}</p>
 {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
				</div>
				<div className="bg-gray-50 px-4 py-3 flex flex-col gap-2 sm:flex-row-reverse sm:px-6">
					<button
						type="button"
						disabled={busy} onClick={onConfirm}
						className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm ${
							isDestructive ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
						} focus:outline-none focus:ring-2 focus:ring-offset-2`}
					>
						{busy ? 'Processing… ⏳' : confirmText}
					</button>
					<button
						type="button"
						autoFocus disabled={busy} onClick={onCancel}
						className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
					>
						{cancelText}
					</button>
				</div>
			</div>
		</ModalDialog>
	);
};
