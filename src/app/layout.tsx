import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { MemberProvider } from './context/MemberProvider';
import { AuthProvider } from './context/AuthProvider';
import { ApolloWrapper } from './context/ApolloWrapper';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = { viewportFit: 'cover' };

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
				<AuthProvider>
					<ApolloWrapper>
						<MemberProvider>{children}</MemberProvider>
					</ApolloWrapper>
				</AuthProvider>
			</body>
		</html>
	);
}
