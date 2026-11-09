'use client';

import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	useCallback,
	type ReactNode,
} from 'react';
import { useApolloClient } from '@apollo/client';
import { domainCacheFor, type DomainCache } from '../lib/domainCache';
import { apiLockFor, type APILock } from '../lib/apiLock';
import { useAuth } from './AuthProvider';

/** One barrier per identity transition. Never acquire the lock inside its callback. */
class ScopeBarrier {
	private attempt = 0;
	constructor(
		private readonly lock: APILock,
		private readonly domain: DomainCache
	) {}
	get generation() {
		return this.attempt;
	}
	cancel = () => {
		this.attempt++;
	};
	async enter(isCurrent: () => boolean): Promise<boolean> {
		const attempt = ++this.attempt;
		try {
			await this.lock.flush(() =>
				this.domain.exec([
					{ type: 'trip.clear', target: { scope: 'all' } },
					{ type: 'user.clear' },
				])
			);
		} catch (error) {
			if (attempt !== this.attempt || !isCurrent()) return false;
			throw error;
		}
		return attempt === this.attempt && isCurrent();
	}
}

function useDependencies() {
	const client = useApolloClient();
	return useMemo(
		() => ({
			client,
			domain: domainCacheFor(client.cache),
			lock: apiLockFor(client),
		}),
		[client]
	);
}

type Dependencies = ReturnType<typeof useDependencies>;
export type ApiScope = Dependencies & {
	identity: string;
	isCurrent: () => boolean;
};

const Context = createContext<{
	scope: ApiScope | null;
	error: Error | null;
	retry: () => Promise<void>;
} | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
	const dependencies = useDependencies();
	const { restored, identity, isCurrent } = useAuth();
	const [state, setState] = useState<{
		scope: ApiScope | null;
		error: Error | null;
	}>({ scope: null, error: null });
	const barrier = useMemo(
		() => new ScopeBarrier(dependencies.lock, dependencies.domain),
		[dependencies]
	);
	const retry = useCallback(async () => {
		if (!restored || !isCurrent(identity)) return;
		setState({ scope: null, error: null });
		try {
			const pending = barrier.enter(() => isCurrent(identity));
			const generation = barrier.generation;
			if (
				(await pending) &&
				barrier.generation === generation &&
				isCurrent(identity)
			) {
				setState({
					scope: {
						...dependencies,
						identity,
						isCurrent: () =>
							barrier.generation === generation && isCurrent(identity),
					},
					error: null,
				});
			}
		} catch (cause) {
			if (isCurrent(identity))
				setState({
					scope: null,
					error: cause instanceof Error ? cause : new Error(String(cause)),
				});
		}
	}, [barrier, dependencies, restored, identity, isCurrent]);
	useEffect(() => {
		void retry();
		return barrier.cancel;
	}, [retry, barrier]);
	const scope =
		restored && state.scope?.identity === identity && state.scope.isCurrent()
			? state.scope
			: null;
	return (
		<Context.Provider value={{ scope, error: state.error, retry }}>
			{children}
		</Context.Provider>
	);
}

/** Internal dependencies only. Domain providers own API construction. */
export function useApiScope() {
	const value = useContext(Context);
	if (!value) throw new Error('ApiProvider is required');
	return value;
}
