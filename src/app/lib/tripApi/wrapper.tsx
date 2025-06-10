'use client';

import { ApolloNextAppProvider } from '@apollo/client-integration-nextjs';
import { getClient } from './baseClient';

// you need to create a component to wrap your app in
export function ApolloWrapper({ children }: React.PropsWithChildren) {
	return (
		<ApolloNextAppProvider makeClient={getClient}>
			{children}
		</ApolloNextAppProvider>
	);
}
