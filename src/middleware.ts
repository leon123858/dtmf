import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. 從環境變數讀取你的 Admin Key
const ADMIN_KEY = process.env.ADMIN_KEY;

// 2. 設定 Middleware 要保護的路由
export const config = {
	matcher: '/:path*',
};

// 3. Middleware 主要邏輯
export function middleware(request: NextRequest) {
	const requestKey = request.headers.get('X-Admin-Key');

	if (!ADMIN_KEY || requestKey === ADMIN_KEY) {
		return NextResponse.next();
	} else {
		return NextResponse.json(
			{ success: false, message: 'Unauthorized' },
			{ status: 401 }
		);
	}
}
