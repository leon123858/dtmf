export interface TripHistoryItem {
	id: string;
	name: string; // 新增的欄位
	timestamp: number; // 用於排序
}

const STORAGE_KEY = 'trip_history';
const MAX_HISTORY_LENGTH = 20;

/**
 * 將旅程儲存到 localStorage 中。
 * 如果已存在相同 id 的旅程，會更新其時間戳並移到最前面。
 * @param trip - 包含 id 和 name 的旅程物件
 */
export const SaveTripInStorage = (trip: { id: string; name: string }) => {
	if (typeof window === 'undefined') return;

	const { id, name } = trip; // 解構傳入的物件

	const storedHistory = localStorage.getItem(STORAGE_KEY);
	let history: TripHistoryItem[] = storedHistory
		? JSON.parse(storedHistory)
		: [];

	// 移除已存在的項目 (依據 id)
	history = history.filter((item) => item.id !== id);

	// 在陣列最前面新增項目，包含 id, name 和當前時間戳
	history.unshift({ id, name, timestamp: Date.now() });

	// 維持歷史紀錄的最大長度
	if (history.length > MAX_HISTORY_LENGTH) {
		history = history.slice(0, MAX_HISTORY_LENGTH);
	}

	localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

/**
 * 從 localStorage 中取得旅程歷史紀錄列表。
 * @returns 旅程歷史紀錄陣列，若無或解析失敗則返回 null
 */
export const GetTripListFromStorage = (): TripHistoryItem[] | null => {
	if (typeof window === 'undefined') return null;

	const storedHistory = localStorage.getItem(STORAGE_KEY);
	if (storedHistory) {
		try {
			// 解析後的資料會自動符合更新後的 TripHistoryItem[] 型別
			const history: TripHistoryItem[] = JSON.parse(storedHistory);
			return history;
		} catch (e) {
			console.error('Failed to parse trip history from localStorage', e);
			// 解析失敗時，可以考慮清除錯誤的資料
			// localStorage.removeItem(STORAGE_KEY);
			return null;
		}
	}
	return null;
};
