import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	output: 'standalone',
	distDir: process.env.E2E_BUILD_DIR || '.next',
	env: { E2E_FRONTEND_ENABLE: process.env.E2E_FRONTEND_ENABLE === 'true' ? 'true' : 'false' },
	async rewrites() {
		const backendBaseURL = (process.env.BACKEND_BASE_URL || process.env.NEXT_PUBLIC_API_HTTP_URL || 'http://localhost:8080').replace(/\/+$/, '');
		return [{ source: '/backend/auth/:path*', destination: `${backendBaseURL}/auth/:path*` }];
	},
};

export default nextConfig;
