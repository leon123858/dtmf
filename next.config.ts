import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	/* config options here */
	output: 'standalone',

	publicRuntimeConfig: {
		apiHttpUrl: process.env.NEXT_PUBLIC_API_HTTP_URL,
		apiWsUrl: process.env.NEXT_PUBLIC_API_WS_URL,
	},
};

export default nextConfig;
