export type QueueMode =
	| 'foreground_refresh'
	| 'background_refresh'
	| 'update_data';
export type RefreshResult = 'refreshed' | 'skipped';
type Write = { mode: 'update_data' | 'flush'; start: () => void; running: boolean };
type Refresh = {
	mode: Exclude<QueueMode, 'update_data'>;
	key: string;
	promise: Promise<RefreshResult>;
	start: () => void;
	running: boolean;
};
type Node = Write | Refresh;

/** Client-wide FIFO scheduling. Non-reentrant: operations and synchronous cache
 * callbacks must not acquire this lock again. Commit/clear directly inside operations.
 * Operations own authentication and cache commits. */
export class APILock {
	private readonly queue: Node[] = [];
	private readonly completed = new Map<string, number>();
	constructor(private readonly now: () => number = () => Date.now()) {}

	flush(operation: () => void): Promise<void> {
		return this.enqueue(async () => { this.completed.clear(); operation(); }, 'flush');
	}

	update<T>(operation: () => Promise<T>): Promise<T> {
		return this.enqueue(operation, 'update_data');
	}

	private enqueue<T>(operation: () => Promise<T>, mode: Write['mode']): Promise<T> {
		const promise = new Promise<T>((resolve, reject) => {
			const node: Write = {
				mode,
				running: false,
				start: () => {
					node.running = true;
					void (async () => {
						try {
							resolve(await operation());
						} catch (error) {
							reject(error);
						} finally {
							this.queue.shift();
							this.pump();
						}
					})();
				},
			};
			this.queue.push(node);
		});
		this.pump();
		return promise;
	}

	refresh(
		key: string,
		mode: Exclude<QueueMode, 'update_data'>,
		interval: number,
		operation: () => Promise<void>
	): Promise<RefreshResult> {
		const tail = this.queue.at(-1);
		if (tail && 'key' in tail && tail.key === key) {
			if (!tail.running && mode === 'foreground_refresh') tail.mode = mode;
			return tail.promise;
		}
		if (
			mode === 'background_refresh' &&
			this.queue.some(
				(node) => node.mode === 'background_refresh' && node.key === key
			)
		)
			return Promise.resolve('skipped');
		let resolve!: (result: RefreshResult) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<RefreshResult>((done, fail) => {
			resolve = done;
			reject = fail;
		});
		const node: Refresh = {
			mode,
			key,
			promise,
			running: false,
			start: () => {
				node.running = true;
				void (async () => {
					try {
						const last = this.completed.get(key);
						if (
							node.mode === 'background_refresh' &&
							last !== undefined &&
							this.now() - last < interval
						) {
							resolve('skipped');
							return;
						}
						await operation();
						this.completed.set(key, this.now());
						resolve('refreshed');
					} catch (error) {
						reject(error);
					} finally {
						this.queue.shift();
						this.pump();
					}
				})();
			},
		};
		this.queue.push(node);
		this.pump();
		return promise;
	}

	private pump(): void {
		const head = this.queue[0];
		if (head && !head.running) head.start();
	}
}

const locks = new WeakMap<object, APILock>();
export function apiLockFor(client: object): APILock {
	let lock = locks.get(client);
	if (!lock) {
		lock = new APILock();
		locks.set(client, lock);
	}
	return lock;
}
