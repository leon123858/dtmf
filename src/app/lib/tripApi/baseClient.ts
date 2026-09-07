import { HttpLink, split } from '@apollo/client';
import { ApolloClient, InMemoryCache } from '@apollo/client-integration-nextjs';
import { baseURL, wsURL } from './config';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { tripTypePolicies } from './cache';

const httpLink = new HttpLink({
	uri: baseURL,
});

const wsLink = new GraphQLWsLink(
	createClient({
		url: wsURL,
	})
);

const splitLink = split(
	({ query }) => {
		const definition = getMainDefinition(query);
		return (
			definition.kind === 'OperationDefinition' &&
			definition.operation === 'subscription'
		);
	},
	wsLink,
	httpLink
);

export const getClient = () => new ApolloClient({
	link: splitLink,
	connectToDevTools: false,
	devtools: {
		enabled: false,
	},
	cache: new InMemoryCache({ typePolicies: tripTypePolicies }),
});
