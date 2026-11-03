import { editTrip } from '../../src/app/lib/tripApi/commands';
import { editUser } from '../../src/app/lib/userApi/commands';
import type { DomainCache } from '../../src/app/lib/domainCache';

/** Compile-time boundary checks, included by yarn typecheck. Never executed. */
export function checkCacheContract(cache: DomainCache): void {
	cache.trip.read('trip', false);
	cache.user.read();
	cache.exec({ type: 'trip.clear', target: { scope: 'all' } });
	// @ts-expect-error Domain readers must not expose a writer.
	cache.trip.execute({ type: 'trip.clear', target: { scope: 'all' } });
	// @ts-expect-error Full user replacement must go through exec.
	cache.user.replace({});
	// @ts-expect-error Variant targets require a history selection.
	cache.exec({ type: 'trip.clear', target: { scope: 'variant', tripId: 'trip' } });
	// @ts-expect-error Commands must describe data operations rather than callbacks.
	cache.exec(() => {});
	cache.exec(editTrip({ scope: 'trip', tripId: 'trip' }, draft => { draft.name = 'Name'; }));
	cache.exec(editUser({ userId: 'user' }, draft => { if (draft) draft.name = 'Name'; }));
	// @ts-expect-error Edits must be synchronous.
	editTrip({ scope: 'trip', tripId: 'trip' }, async () => {});
	// @ts-expect-error User edits must be synchronous.
	editUser({ userId: 'user' }, async () => {});
	// @ts-expect-error Reading generations is not a cache data command.
	cache.exec({ type: 'trip.markStale', target: { scope: 'all' } });
	// @ts-expect-error Edit targets cannot edit every trip implicitly.
	editTrip({ scope: 'all' }, () => {});
}
