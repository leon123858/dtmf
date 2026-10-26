'use client';

import { ApolloNextAppProvider } from '@apollo/client-integration-nextjs';
import { getClient } from '../lib/graphClient/baseClient';
import { tripTypePolicies } from '../lib/tripApi/cache';
import { ApiProvider } from '../lib/ApiProvider';
import { userTypePolicies } from '../lib/userApi/cache';

const makeClient = () => getClient({ ...tripTypePolicies, ...userTypePolicies });

// you need to create a component to wrap your app in
export function ApolloWrapper({ children }: React.PropsWithChildren) {
	return (
		<ApolloNextAppProvider makeClient={makeClient}>
			<ApiProvider>{children}</ApiProvider>
		</ApolloNextAppProvider>
	);
}
