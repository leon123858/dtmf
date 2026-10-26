import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { baseURL } from './config';

export function createHttpLink(fetcher?: typeof fetch) {
	return new HttpLink({ uri: baseURL, fetch: fetcher });
}

// Server operations use a request-local client; browser features use the shared provider.
export function createHttpClient(token?: string) {
	return new ApolloClient({
		link: new HttpLink({ uri: baseURL, headers: token ? { Authorization: `Bearer ${token}` } : {} }),
		cache: new InMemoryCache(),
	});
}
