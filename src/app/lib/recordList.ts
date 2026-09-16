import type { Record } from '@/app/lib/types';

export type MemberRole = 'related' | 'payer' | 'participant';
export interface RecordFilters {
	query: string;
	memberId: string | null;
	role: MemberRole;
}

export const defaultRecordFilters: RecordFilters = { query: '', memberId: null, role: 'related' };
export const memberRoleLabels: { [role in MemberRole]: string } = {
	related: '相關', payer: '付款', participant: '分攤',
};

export function filterRecords(records: Record[], filters: RecordFilters) {
	const query = filters.query.trim().toLowerCase();
	return records.filter(record => {
		if (!record.name.toLowerCase().includes(query)) return false;
		if (!filters.memberId) return true;
		const paid = record.prePayAddress.id === filters.memberId;
		const participated = record.shouldPayAddress.some(address => address.id === filters.memberId);
		return filters.role === 'payer' ? paid : filters.role === 'participant' ? participated : paid || participated;
	});
}

export function prepareRecordRows(records: Record[]) {
	const sorted = [...records].sort((a, b) =>
		Number(a.isValid) - Number(b.isValid) ||
		Number(a.time) - Number(b.time) || a.name.localeCompare(b.name)
	);
	let previousGroup = '';
	return sorted.map(record => {
		const date = new Date(Number(record.time));
		const group = record.isValid ? date.toDateString() : 'invalid';
		const separator = group === previousGroup ? null : record.isValid ? date.toLocaleDateString() : '無效帳目';
		previousGroup = group;
		return { record, separator };
	});
}

export function recordStatuses(record: Record) {
	return [
		...(!record.isValid ? ['無效帳目'] : []),
		...(record.isDeleted ? ['已刪除'] : !record.isActive ? ['舊版本'] : []),
	];
}
