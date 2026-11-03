'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useApolloClient } from '@apollo/client';
import { UserApi } from './userApi/client';
import type { MemberApi } from './userApi/public';
import { authStore } from './auth/store';
import { TripApi } from './tripApi/client';
import { domainCacheFor } from './domainCache';
import { apiLockFor } from './apiLock';
import type { TripService } from './tripApi/public';

interface DomainApis {
	trip: TripService;
	createMember: (isCurrent: () => boolean) => MemberApi;
}
const Context = createContext<DomainApis | null>(null);

/** The sole browser composition boundary between Apollo and domain consumers. */
export function ApiProvider({ children }: { children: ReactNode }) {
	const client = useApolloClient();
	const apis = useMemo<DomainApis>(() => {
		const domain = domainCacheFor(client.cache);
		const lock = apiLockFor(client);
		const trip = new TripApi(client, authStore.getAccessIdentity, domain, lock);
		return { trip, createMember: (isCurrent: () => boolean) => new UserApi(client, isCurrent, domain, lock) };
	}, [client]);
	useEffect(() => {
		let generation = authStore.getAccessIdentity();
		return authStore.subscribe(() => {
			const next = authStore.getAccessIdentity();
			if (next !== generation) { generation = next; void apis.trip.flush().catch(() => {}); }
		});
	}, [apis]);
	return <Context.Provider value={apis}>{children}</Context.Provider>;
}
export function useDomainApis(): DomainApis {
	const apis = useContext(Context);
	if (!apis) throw new Error('ApiProvider is required');
	return apis;
}
