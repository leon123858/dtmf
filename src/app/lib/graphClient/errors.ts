import { ApolloError } from '@apollo/client';
import { MyError } from '../errors';

export function MyApolloError(error: unknown): MyError | null {
	if (!(error instanceof ApolloError)) return null;
	const code = error.graphQLErrors.find(
		(item) => typeof item.extensions?.code === 'string'
	)?.extensions?.code;
	if (typeof code === 'string' && MyError.hasCode(code))
		return new MyError(code);
	const network = error.networkError;
	if (network && 'statusCode' in network && network.statusCode === 401)
		return new MyError('UNAUTHENTICATED');
	return null;
}
