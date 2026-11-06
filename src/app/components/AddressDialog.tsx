'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ModalDialog } from './ModalDialog';

export function AddressDialog({ title, children, onClose, busy, error, returnFocus }: {
 title: string; children: ReactNode; onClose: () => void; busy: boolean; error: string; returnFocus: HTMLButtonElement | null;
}) {
 const titleId = useId();
 const content = useRef<HTMLDivElement>(null);
 const [viewport, setViewport] = useState<{ height: number; top: number }>();
 useEffect(() => {
  const bodyOverflow = document.body.style.overflow;
  const rootOverflow = document.documentElement.style.overflow;
  const x = window.scrollX, y = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  const visual = window.visualViewport;
  let frame = 0;
  const update = () => {
   if (visual && visual.scale === 1) setViewport({ height: visual.height, top: visual.offsetTop });
   cancelAnimationFrame(frame);
   frame = requestAnimationFrame(() => {
    const input = document.activeElement;
    const parent = content.current;
    if (!(input instanceof HTMLElement) || !parent?.contains(input)) return;
    const box = input.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
    if (box.bottom > bounds.bottom) parent.scrollTop += box.bottom - bounds.bottom;
    else if (box.top < bounds.top) parent.scrollTop -= bounds.top - box.top;
   });
  };
  content.current?.querySelector<HTMLInputElement>('input[data-address-name]')?.focus({ preventScroll: true });
  update();
  visual?.addEventListener('resize', update);
  visual?.addEventListener('scroll', update);
  return () => {
   cancelAnimationFrame(frame);
   visual?.removeEventListener('resize', update);
   visual?.removeEventListener('scroll', update);
   document.body.style.overflow = bodyOverflow;
   document.documentElement.style.overflow = rootOverflow;
   window.scrollTo(x, y);
   requestAnimationFrame(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
   });
  };
 }, [returnFocus]);
 return <ModalDialog isOpen onClose={onClose} busy={busy} labelId={titleId}
  style={{ top: (viewport?.top ?? 0) + 16, maxHeight: viewport ? Math.max(0, viewport.height - 32) : 'calc(100dvh - 2rem)' }}
  className='fixed inset-x-0 bottom-auto mx-auto my-0 w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-xl bg-white p-0 text-gray-800 backdrop:bg-black/50'>
  <div ref={content} className='overflow-y-auto overscroll-contain p-5' style={{ maxHeight: viewport ? Math.max(0, viewport.height - 32) : 'calc(100dvh - 2rem)' }}>
   <h2 id={titleId} className='mb-4 text-xl font-bold'>{title}</h2>
   {error && <p role='alert' className='mb-3 text-red-700'>{error}</p>}
   {children}
  </div>
 </ModalDialog>;
}
