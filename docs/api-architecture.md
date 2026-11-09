# Provider and API ownership

The root layout mounts `AppProviders` as the only composition entry point:

```text
ApolloWrapper
└─ AuthProvider
   └─ ApiProvider
      └─ MemberProvider
         └─ TripProvider
            └─ children
               └─ SingleTripProvider (trip page)
```

`ApolloWrapper` supplies one browser Apollo client with trip and user cache policies. It does not mount domain providers. Server actions retain request-local clients and APIs.

`AuthProvider` alone restores browser login in an effect and observes the auth store for React. `useAuth()` exposes `restored`, a token-independent access `identity`, and stable `isCurrent(identity)`. The latter reads the authoritative store immediately, including before React renders a session change. Restoration completes even without stored credentials or when storage fails. HTTP transport uses the store for tokens and refresh coordination, without initiating restoration. WebSocket authentication is unchanged.

`context/ApiProvider.tsx` supplies internal dependencies and scope readiness, rather than domain API factories. `domainCacheFor` and `apiLockFor` retain one DomainCache and APILock per Apollo cache/client. Until auth restoration completes, no scope is available. Each identity transition hides the old scope synchronously and queues a FIFO flush that directly clears both trip and user data. The flush never reacquires the non-reentrant lock. Only the latest still-current barrier publishes a scope; failed clears leave the scope unavailable with an error and asynchronous retry. Unmounts and retries invalidate old scope leases. Token refresh does not replace scopes, clear caches or initialize domains. Children stay mounted throughout readiness transitions.

`MemberProvider` constructs and owns a session-scoped `UserApi` implementing MemberApi only for a ready, authenticated scope. It initializes once per login and disposes on scope change or unmount. It exposes data and operations through `useMember()`, never the raw API. Member initialization is independent of trip readiness; both domains still serialize operations through the shared FIFO lock. Protected member snapshots are hidden immediately on identity change. Only the composition layer clears session data.

`TripProvider` exposes `useTripApi()` with `ready`, `error`, `retry` and `createTrip(tripId, { haveHistory })`. Its factory reference changes only with the scope/client. An unavailable or stale factory throws the `api-not-ready` domain error. The parameter-bound TripApi provides stable cache-only `subscribe(listener)` and `getSnapshot()` functions, with history fallback. Operations infer the trip ID and verify identity before queue execution and cache commits. `createTripStore` directly uses the internal TripClient for request and cache coordination.

`SingleTripProvider` memoizes its API only when ready and otherwise uses fixed empty cache readers/subscriptions. It owns page loading/error state, the single 20-second polling timer, access suspension, local visit history, favorite synchronization and UI state. Mutation hooks use TripProvider without changing their component-facing interfaces. Ordinary tabs, member updates and token refresh do not recreate the trip factory or query a trip. Member initialization failure does not prevent trip reads.

DomainCache exposes cache-only reader facades and explicit `exec` commands (`edit`, `replace`, `clear`). Commands have no implicit cross-domain effects. APIs list required commands and commit confirmed responses only. Recipes run synchronously against the current payload, never perform requests or nested exec, and retain version/history/reference/name-overlay protections. Command lists have no cross-domain rollback; adapters batch individual compound writes.

APILock is non-reentrant even from synchronous subscriptions. Writes and refreshes share FIFO scheduling through validation and cache commit. Flushes break refresh merging and reset polling timestamps. Force refresh enqueues inactive-history clearing before the foreground read and retains the active snapshot on read failure. Access-loss clearing inside an operation commits directly; external clearing uses queued flushes. Session guards prevent old responses from restoring protected data.

Run `yarn lint`, `yarn typecheck`, `yarn build`, `yarn test:node`, and `yarn test:e2e`. `scripts/api-scope.test.mjs` exercises FIFO barriers, rapid identity changes, cancellation, failure and retry. Existing auth/member/trip-cache tests cover restoration, stale responses, delayed member initialization, refresh stability, polling, favorites and request counts.
