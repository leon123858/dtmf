'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTrips } from '@/app/context/TripProvider';
import { Trip, Record as RecordType } from '@/app/lib/types';

// 引入拆分的元件
import { Header } from '@/app/components/Header';
import { TabBar } from '@/app/components/Tabbar';
import { RecordList } from '@/app/components/RecordList';
import { MoneyShare } from '@/app/components/MoneyShare';
import { AddressList } from '@/app/components/AddressList';
import { RecordModal } from '@/app/components/RecordModal';

// 建立一個新的 Context 專門給單一旅程頁面使用
// 這樣就不用在每個子元件都傳遞 trip 和 api
interface SingleTripContextType {
	trip: Trip;
	api: {
		createRecord: (newRecord: Omit<RecordType, 'id'>) => void;
		updateRecord: (
			recordId: string,
			updatedRecord: Partial<Omit<RecordType, 'id'>>
		) => void;
		removeRecord: (recordId: string) => void;
		createAddress: (address: string) => void;
		deleteAddress: (address: string) => void;
	};
}
export const SingleTripContext =
	React.createContext<SingleTripContextType | null>(null);

export default function TripPage() {
	const router = useRouter();
	const params = useParams();
	const tripId = params.tripId as string;

	const { getTripById, updateTrip: updateGlobalTrip } = useTrips();

	// 將旅程狀態存在本地，以便編輯
	const [trip, setTrip] = useState<Trip | null>(null);
	const [activeTab, setActiveTab] = useState('records'); // 'records', 'share', 'members'
	const [showAddRecordModal, setShowAddRecordModal] = useState(false);
	const [editingRecord, setEditingRecord] = useState<RecordType | null>(null);

	// 從全域狀態初始化本地狀態
	useEffect(() => {
		const tripData = getTripById(tripId);
		if (tripData) {
			setTrip(tripData);
		}
	}, [tripId, getTripById]);

	// 當本地 trip 狀態更新時，同步回全域狀態
	useEffect(() => {
		if (trip) {
			updateGlobalTrip(trip.id, trip);
		}
	}, [trip, updateGlobalTrip]);

	// 更新網頁標題
	useEffect(() => {
		if (trip) {
			document.title = `${trip.name} | 旅遊分帳`;
		}
	}, [trip]);

	// API 函式 (類似原本的 useMemo)
	const api = useMemo(
		() => ({
			createRecord: (newRecord: Omit<RecordType, 'id'>) => {
				setTrip((prevTrip) =>
					prevTrip
						? {
								...prevTrip,
								records: [
									...prevTrip.records,
									{ ...newRecord, id: `rec-${Date.now()}` },
								],
						  }
						: null
				);
			},
			updateRecord: (
				recordId: string,
				updatedRecord: Partial<Omit<RecordType, 'id'>>
			) => {
				setTrip((prevTrip) =>
					prevTrip
						? {
								...prevTrip,
								records: prevTrip.records.map((r) =>
									r.id === recordId ? { ...r, ...updatedRecord } : r
								),
						  }
						: null
				);
			},
			removeRecord: (recordId: string) => {
				setTrip((prevTrip) =>
					prevTrip
						? {
								...prevTrip,
								records: prevTrip.records.filter((r) => r.id !== recordId),
						  }
						: null
				);
			},
			createAddress: (address: string) => {
				if (trip?.addressList.includes(address)) {
					alert('此地址已存在！');
					return;
				}
				setTrip((prevTrip) =>
					prevTrip
						? {
								...prevTrip,
								addressList: [...prevTrip.addressList, address],
						  }
						: null
				);
			},
			deleteAddress: (address: string) => {
				const isAddressInvolved = trip?.records.some(
					(r) =>
						r.prePayAddress === address || r.shouldPayAddress.includes(address)
				);
				if (isAddressInvolved) {
					alert('無法刪除！此成員已參與帳目，請先移除相關帳目。');
					return;
				}
				setTrip((prevTrip) =>
					prevTrip
						? {
								...prevTrip,
								addressList: prevTrip.addressList.filter((a) => a !== address),
						  }
						: null
				);
			},
		}),
		[trip]
	);

	const openAddModal = () => {
		setEditingRecord(null);
		setShowAddRecordModal(true);
	};

	const openEditModal = (record: RecordType) => {
		setEditingRecord(record);
		setShowAddRecordModal(true);
	};

	const closeAddModal = () => {
		setShowAddRecordModal(false);
		setEditingRecord(null);
	};

	if (!trip) {
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

	return (
		<SingleTripContext.Provider value={{ trip, api }}>
			<div className='bg-gray-100 font-sans min-h-screen'>
				<div className='container mx-auto max-w-lg p-4'>
					<Header onAddClick={openAddModal} />
					<TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
					<main className='mt-4'>
						{activeTab === 'records' && <RecordList onEdit={openEditModal} />}
						{activeTab === 'share' && <MoneyShare />}
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
