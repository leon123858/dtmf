import { authenticatedFetch } from '../auth/fetch';
import { createHttpLink } from './http';
import { split, type TypePolicies } from '@apollo/client';
import { ApolloClient, InMemoryCache } from '@apollo/client-integration-nextjs';
import { wsURL } from './config';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';

const httpLink = createHttpLink(authenticatedFetch);

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

export const getClient = (typePolicies: TypePolicies) =>
	new ApolloClient({
		link: splitLink,
		connectToDevTools: false,
		devtools: {
			enabled: false,
		},
		cache: new InMemoryCache({ typePolicies }),
	});
