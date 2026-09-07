'use client';

import { ReactNode, useEffect, useRef } from 'react';

// Native modal dialogs trap focus, make the background inert, and restore focus.
export function ModalDialog({ isOpen, onClose, busy = false, labelId, className, children }: {
	isOpen: boolean; onClose: () => void; busy?: boolean;
	labelId: string; className?: string; children: ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		if (isOpen && !dialog?.open) dialog?.showModal();
		if (!isOpen && dialog?.open) dialog.close();
	}, [isOpen]);
	return <dialog ref={ref} aria-labelledby={labelId} aria-busy={busy} className={className}
		onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
		onClick={event => {
			if (event.target !== event.currentTarget || busy) return;
			const rect = event.currentTarget.getBoundingClientRect();
			if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
		}}>{children}</dialog>;
}
