import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TripProvider } from './context/TripProvider'; // 引入 Provider

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
	title: '旅遊分帳應用',
	description: '輕鬆、公平地分攤旅途中的每一筆花費。',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='zh-TW'>
			<body className={inter.className}>
				<TripProvider>
					{' '}
					{/* 在這裡包裹 */}
					{children}
				</TripProvider>
			</body>
		</html>
	);
}
