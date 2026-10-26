import { MyError } from './error';

export function longStringSimplify(
	str: string,
	maxLength: number = 15
): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - 3) + '...';
}

export async function httpCall(
	url: string,
	body?: Record<string, string>,
	timeout_ms: number = 30000
) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeout_ms);
	try {
		const response = await fetch(`${url}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer',
			signal: controller.signal,
		});
		const data = await response.json().catch((error: unknown) => {
			if (controller.signal.aborted) throw error;
			return null;
		});
		if (!response.ok)
			throw new MyError(
				typeof data?.error === 'string' ? data.error : 'internal_error',
				response.status
			);
		return data;
	} catch (error: unknown) {
		if (error instanceof MyError) throw error;
		if (controller.signal.aborted || error instanceof TypeError) {
			const failure = new MyError(controller.signal.aborted ? 'upstream_timeout' : 'upstream_error');
			failure.message += ` (${error instanceof Error ? error.message : String(error)})`;
			throw failure;
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}
