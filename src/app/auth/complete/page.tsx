import type { Metadata } from 'next';
import { AuthComplete } from './AuthComplete';
export const metadata: Metadata = {
	title: '完成登入',
	referrer: 'no-referrer',
	robots: { index: false, follow: false },
};
export default function Page() {
	return <AuthComplete />;
}
