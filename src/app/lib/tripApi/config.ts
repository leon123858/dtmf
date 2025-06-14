import getConfig from 'next/config';

const { publicRuntimeConfig } = getConfig();

// should set environment variable NEXT_PUBLIC_API_IP to the IP address of the API server
export const baseURL = publicRuntimeConfig.apiIP
	? `http://${publicRuntimeConfig.apiIP}/query`
	: 'http://127.0.0.1:8080/query';
export const wsURL = publicRuntimeConfig.apiIP
	? `ws://${publicRuntimeConfig.apiIP}/subscription`
	: 'ws://127.0.0.1:8080/subscription';
