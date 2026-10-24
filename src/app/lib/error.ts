const messages: Record<string, string> = {
	access_denied: '已取消或拒絕 Google 授權，可重新登入。',
	invalid_login_code: '登入連結已失效或已使用，請重新登入。',
	invalid_state: '登入流程已失效，請重新登入。',
	invalid_provider_credential: 'Google 登入驗證失敗，請重新登入。',
	invalid_refresh_token: '登入已失效，請重新登入。',
	upstream_error: '登入服務暫時無法使用，請稍後再試。',
	upstream_timeout: '登入服務暫時無法使用，請稍後再試。',
	unexpected_front_err: '前端登入服務發生不預期錯誤，請稍後再試。',
};
export function errorMessage(code: string) {
	return messages[code] ?? `登入服務發生錯誤，請重新登入或稍後再試。(${code})`;
}
export class MyError extends Error {
	constructor(
		public code: string,
		public status = 0
	) {
		super((status > 0 ? `${status}: ` : '') + errorMessage(code));
	}
}
