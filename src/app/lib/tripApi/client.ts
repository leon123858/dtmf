import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { WebSocketLink } from '@apollo/client/link/ws';
import { split } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';

// HTTP 連接
const httpLink = createHttpLink({
	uri: 'http://localhost:8080/query', // 請替換成你的 GraphQL 後端 URI
});

// WebSocket 連接 (用於 Subscription)
const wsLink = new WebSocketLink({
	uri: 'ws://localhost:8080/query', // 請替換成你的 GraphQL 後端 WebSocket URI
	options: {
		reconnect: true,
	},
});

// Auth Link (如果需要身份驗證)
const authLink = setContext((_, { headers }) => {
	// 從 localStorage 或其他地方獲取 token
	const token = localStorage.getItem('token');
	return {
		headers: {
			...headers,
			authorization: token ? `Bearer ${token}` : '',
		},
	};
});

// 使用 split 函數將操作路由到指定的 link
// operation 是查詢 (query) 還是訂閱 (subscription)
const splitLink = split(
	({ query }) => {
		const definition = getMainDefinition(query);
		return (
			definition.kind === 'OperationDefinition' &&
			definition.operation === 'subscription'
		);
	},
	wsLink, // 對於訂閱使用 WebSocketLink
	authLink.concat(httpLink) // 對於查詢和 mutation 使用 HttpLink (帶 authLink)
);

const client = new ApolloClient({
	link: splitLink,
	cache: new InMemoryCache(),
});

export default client;
