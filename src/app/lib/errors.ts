const messages: Record<string, string> = {
	UNAUTHENTICATED: '請登入或重新取得登入憑證。', FORBIDDEN: '你沒有此旅程的存取或操作權限。',
	BAD_USER_INPUT: '輸入資料不合法，請檢查後重試。', NOT_FOUND: '要求的旅程、成員或收藏不存在。',
	CONFLICT: '操作衝突：成員可能已被綁定、暱稱重複，或目前狀態不允許此操作。',
	INTERNAL_SERVER_ERROR: '服務暫時無法使用，請稍後重試。',
	access_denied: '已取消或拒絕第三方授權，可重新登入。',
	invalid_login_code: '登入連結已失效或已使用，請重新登入。',
	invalid_state: '登入流程已失效，請重新登入。',
	invalid_provider_credential: '第三方登入驗證失敗，請重新登入。',
	invalid_refresh_token: '登入已失效，請重新登入。',
	upstream_error: '登入服務暫時無法使用，請稍後再試。',
	upstream_timeout: '登入服務暫時無法使用，請稍後再試。',
	unexpected_front_err: '前端登入服務發生不預期錯誤，請稍後再試。',
};
export function errorMessage(code: string) {
	return `${messages[code] ?? '登入服務發生錯誤，請重新登入或稍後再試。'} (${code})`;
}
export class MyError extends Error {
	constructor(
		public code: string,
		public status = 0,
		message?: string
	) {
		super(message ?? (status > 0 ? `${status}: ` : '') + errorMessage(code));
	}

	static hasCode(code: string): boolean {
		return Object.prototype.hasOwnProperty.call(messages, code);
	}

	static isAccessError(error: unknown): error is MyError {
		return error instanceof MyError && error.isAccessError();
	}

	isAccessError(): boolean {
		return ['UNAUTHENTICATED', 'FORBIDDEN', 'unauthenticated'].includes(this.code);
	}
}
