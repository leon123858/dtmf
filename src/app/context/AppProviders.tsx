'use client';

import type { ReactNode } from 'react';
import { ApolloWrapper } from './ApolloWrapper';
import { AuthProvider } from './AuthProvider';
import { ApiProvider } from './ApiProvider';
import { MemberProvider } from './MemberProvider';
import { TripProvider } from './TripProvider';

export function AppProviders({ children }: { children: ReactNode }) {
	return (
		<ApolloWrapper>
			<AuthProvider>
				<ApiProvider>
					<MemberProvider>
						<TripProvider>{children}</TripProvider>
					</MemberProvider>
				</ApiProvider>
			</AuthProvider>
		</ApolloWrapper>
	);
}
