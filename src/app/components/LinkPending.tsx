'use client';

import { useLinkStatus } from 'next/link';

/** Render inside a native Next.js Link; navigation remains owned by Next.js. */
export function LinkPending() {
 const { pending } = useLinkStatus();
 if (!pending) return null;
 return <span role='status' aria-label='頁面載入中' className='pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-blue-100'>
  <span className='navigation-progress block h-full w-1/3 bg-blue-600' />
  <span className='sr-only'>頁面載入中…</span>
 </span>;
}
