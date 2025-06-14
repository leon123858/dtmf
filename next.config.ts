import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	/* config options here */
	output: 'standalone',

	publicRuntimeConfig: {
		apiIP: process.env.NEXT_PUBLIC_API_IP,
	},
};

export default nextConfig;
