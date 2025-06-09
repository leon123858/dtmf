export function longStringSimplify(str: string, maxLength: number = 5): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - 3) + '...';
}
