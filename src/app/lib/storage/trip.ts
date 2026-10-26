import type { SubscribedTrip } from '../userApi/types';
export interface TripHistoryItem { id: string; name: string; timestamp: number }
const STORAGE_KEY = 'trip_history';
let memory: TripHistoryItem[] = [];
export const GetTripListFromStorage = (): TripHistoryItem[] | null => {
	if (typeof window === 'undefined') return null;
	try {
		const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
		memory = Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Number.isFinite(item.timestamp)).slice(0, 20) : [];
	} catch { /* Storage may be unavailable; keep this page's history in memory. */ }
	return memory;
};
const write = (items: TripHistoryItem[]) => {
	memory = items;
	try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* Memory fallback. */ }
};
export const SaveTripInStorage = (trip: { id: string; name: string }) => {
	if (typeof window === 'undefined') return;
	write([{ ...trip, timestamp: Date.now() }, ...(GetTripListFromStorage() || []).filter(item => item.id !== trip.id)].slice(0, 20));
};
export const RenameTripInStorage = (id: string, name: string) => {
	if (typeof window !== 'undefined') write((GetTripListFromStorage() || []).map(item => item.id === id ? { ...item, name } : item));
};
export function mergeHistory(local: TripHistoryItem[], saved: SubscribedTrip[]) {
	const entries = new Map(local.map(item => [item.id, { ...item, local: true, saved: false }]));
	for (const trip of saved) {
		const existing = entries.get(trip.id);
		entries.set(trip.id, { id: trip.id, name: trip.name, timestamp: Math.max(existing?.timestamp || 0, Number(trip.lastViewedAt) || 0), local: !!existing, saved: true });
	}
	return [...entries.values()].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
