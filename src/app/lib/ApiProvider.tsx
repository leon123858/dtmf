'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApolloClient } from '@apollo/client';
import { UserApi } from './userApi/client';
import type { MemberApi } from './userApi/public';
import { TripApi } from './tripApi/client';
import type { TripService } from './tripApi/public';

interface DomainApis {
	trip: TripService;
	createMember: (isCurrent: () => boolean) => MemberApi;
}
const Context = createContext<DomainApis | null>(null);

/** The sole browser composition boundary between Apollo and domain consumers. */
export function ApiProvider({ children }: { children: ReactNode }) {
	const client = useApolloClient();
	const apis = useMemo<DomainApis>(() => ({ trip: new TripApi(client), createMember: isCurrent => new UserApi(client, isCurrent) }), [client]);
	return <Context.Provider value={apis}>{children}</Context.Provider>;
}
export function useDomainApis(): DomainApis {
	const apis = useContext(Context);
	if (!apis) throw new Error('ApiProvider is required');
	return apis;
}
