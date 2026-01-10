'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';

// 引入拆分的元件
import { Header } from '@/app/components/Header';
import { TabBar } from '@/app/components/Tabbar';
import { RecordList } from '@/app/components/RecordList';
import { MoneyShare } from '@/app/components/MoneyShare';
import { AddressList } from '@/app/components/AddressList';
import { RecordModal } from '@/app/components/RecordModal';
import { SaveTripInStorage } from '@/app/lib/storage/trip';

export default function TripPage() {
	const router = useRouter();
	const params = useParams();
	const tripId = params.tripId as string;

	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const {
		data: tripData,
		loading: tripLoading,
		error: tripError,
	} = useTrip(tripId);

	// 將旅程狀態存在本地，以便編輯
	const [activeTab, setActiveTab] = useState('records');
	const [showAddRecordModal, setShowAddRecordModal] = useState(false);
	const [editingRecord, setEditingRecord] = useState<
		Record | Omit<Record, 'id' | 'time' | 'isValid'> | null
	>(null);

	// 更新網頁標題
	useEffect(() => {
		if (tripData && tripData.name && tripId) {
			document.title = `${tripData.name} | 旅遊分帳`;
			SaveTripInStorage({
				id: tripId,
				name: tripData.name,
			});
		}
	}, [tripData, tripId]);

	const openAddModal = () => {
		setEditingRecord(null);
		setShowAddRecordModal(true);
	};

	const openEditModal = (
		record: Record | Omit<Record, 'id' | 'time' | 'isValid'>
	) => {
		setEditingRecord(structuredClone(record)); // 使用 structuredClone 確保不會修改原始資料
		setShowAddRecordModal(true);
	};

	const closeAddModal = () => {
		setShowAddRecordModal(false);
		setEditingRecord(null);
	};

	if (!tripData && tripError) {
		return (
			<div className='bg-gray-900 text-white h-screen flex flex-col items-center justify-center'>
				<p className='mb-4'>找不到旅程資料...</p>
				<button
					onClick={() => router.push('/')}
					className='bg-blue-500 text-white py-2 px-4 rounded-lg'
				>
					返回首頁
				</button>
			</div>
		);
	}

	if (tripLoading) {
		return (
			<div className='bg-gray-100 min-h-screen flex items-center justify-center'>
				<p className='text-gray-500'>載入中...</p>
			</div>
		);
	}

	return (
		<SingleTripContext.Provider value={{ tripId }}>
			<div className='bg-gray-100 font-sans min-h-screen'>
				<div className='container mx-auto max-w-lg p-4'>
					<Header onAddClick={openAddModal} />
					<TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
					<main className='mt-4'>
						{activeTab === 'records' && <RecordList onEdit={openEditModal} />}
						{activeTab === 'share' && <MoneyShare onRepay={openEditModal} />}
						{activeTab === 'members' && <AddressList />}
					</main>
				</div>
				{showAddRecordModal && (
					<RecordModal onClose={closeAddModal} record={editingRecord} />
				)}
			</div>
		</SingleTripContext.Provider>
	);
}
