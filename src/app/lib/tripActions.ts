'use server'; // 標記為 Server Action 檔案

import { redirect } from 'next/navigation';

export async function createTripAction(formData: FormData) {
	// 從表單數據中獲取 tripName
	const tripName = formData.get('tripName');

	if (!tripName || typeof tripName !== 'string' || tripName.trim() === '') {
		// 可以在這裡處理錯誤，例如拋出錯誤或返回錯誤訊息
		throw new Error('旅程名稱不能為空。');
	}

	// mock
	const newTrip = {
		id: `trip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // 簡單的 ID 生成
		name: tripName.trim(),
		createdAt: new Date().toISOString(),
		// 這裡可以根據你的 TripProvider 添加其他初始屬性
	};

	console.log('新旅程已創建:', newTrip);

	// 創建完成後，使用 Next.js 的 redirect 導航到新旅程的頁面
	// 這會導致頁面重新載入到新的 URL，模擬傳統表單提交的行為
	redirect(`/trip/${newTrip.id}`);
}
