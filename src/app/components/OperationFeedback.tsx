import { LoaderCircle } from 'lucide-react';

export function OperationFeedback({ pending, children }: { pending: boolean; children: React.ReactNode }) {
 return <span aria-busy={pending} className='inline-flex items-center justify-center gap-2'>
  {pending && <LoaderCircle size={18} aria-hidden='true' className='shrink-0 animate-spin motion-reduce:animate-none' />}
  <span>{children}</span>
 </span>;
}
