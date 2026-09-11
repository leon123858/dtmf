import type { Record } from '@/app/lib/types';

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
