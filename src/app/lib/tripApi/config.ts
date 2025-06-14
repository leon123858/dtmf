/**
 * Configuration for the Trip API (this kind of ENV bind with frontend when compile).
 * This file defines the base URL for HTTP requests and WebSocket connections.
 * It uses environment variables to allow for different configurations in development and production.
 * If the environment variables are not set, it defaults to local URLs.
 */

export const baseURL = process.env.NEXT_PUBLIC_API_HTTP_URL
	? `${process.env.NEXT_PUBLIC_API_HTTP_URL}/query`
	: 'http://127.0.0.1:8080/query';
export const wsURL = process.env.NEXT_PUBLIC_API_WS_URL
	? `${process.env.NEXT_PUBLIC_API_WS_URL}/subscription`
	: 'ws://127.0.0.1:8080/subscription';
