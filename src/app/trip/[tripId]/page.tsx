'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { Record } from '@/app/lib/types';
import { useGraphQLClient } from '@/app/lib/tripApi/client';

import { TripSyncNotice } from '@/app/components/TripSyncNotice';
import { Header } from '@/app/components/Header';
import { TabBar, type TripTab } from '@/app/components/Tabbar';
import { RecordList } from '@/app/components/RecordList';
import { MoneyShare } from '@/app/components/MoneyShare';
import { AddressList } from '@/app/components/AddressList';
import { RecordForm } from '@/app/components/RecordForm';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import { SaveTripInStorage } from '@/app/lib/storage/trip';

export default function TripPage() {
	const params = useParams();
	const tripId = params.tripId as string;
 return <TripContent key={tripId} tripId={tripId} />;
}

type EditableRecord = Record | Omit<Record, 'id' | 'time' | 'isValid'>;

function TripContent({ tripId }: { tripId: string }) {
 const router = useRouter();
 const [showHistory, setShowHistory] = useState(false);

	const {
		queries: { useTrip },
	} = useGraphQLClient();

	const {
		data: tripData,
		loading: tripLoading,
		error: tripError,
	} = useTrip(tripId);

	// 將旅程狀態存在本地，以便編輯
	const [activeTab, setActiveTab] = useState<TripTab>('records');
	const [hasDraft, setHasDraft] = useState(false);
 const [draftKey, setDraftKey] = useState(0);
 const dirty = useRef(false);
 const busy = useRef(false);
 const sourceTab = useRef<TripTab>('records');
 const mainRef = useRef<HTMLElement>(null);
 const [viewportHeight, setViewportHeight] = useState<number>();
 // Mobile keyboards resize the visual viewport even when 100dvh is unchanged.
 useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => { if (viewport.scale === 1) setViewportHeight(viewport.height); };
    resize();
    viewport.addEventListener('resize', resize);
    return () => viewport.removeEventListener('resize', resize);
 }, []);
 const [notice, setNotice] = useState('');
 const [pendingRecord, setPendingRecord] = useState<EditableRecord | null>(null);
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

 const focusContent = (tab: TripTab) => requestAnimationFrame(() => {
    if (tab !== 'records') mainRef.current?.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
 });
 const selectTab = (tab: TripTab) => {
    if (tab === 'entry' && !hasDraft) {
        setHasDraft(true);
        sourceTab.current = 'records';
    }
    setActiveTab(tab);
    focusContent(tab);
 };
 const startEdit = (record: EditableRecord) => {
    sourceTab.current = activeTab;
    dirty.current = false;
    setEditingRecord(structuredClone(record));
    setDraftKey(key => key + 1);
    setHasDraft(true);
    setActiveTab('entry');
    setPendingRecord(null);
    focusContent('entry');
 };
 const openRecordForm = (record: EditableRecord) => {
    if (busy.current) return;
    if (hasDraft && dirty.current) setPendingRecord(record);
    else startEdit(record);
 };
 const finishDraft = (success: boolean) => {
    setActiveTab(editingRecord ? sourceTab.current : 'records');
    setHasDraft(false);
    setEditingRecord(null);
    dirty.current = false;
    busy.current = false;
    setNotice(success ? '帳目已儲存' : '已取消記帳');
    focusContent(editingRecord ? sourceTab.current : 'records');
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

	if (tripLoading && !tripData) {
		return (
			<div className='bg-gray-100 min-h-screen flex items-center justify-center'>
				<p className='text-gray-500'>載入中...</p>
			</div>
		);
	}

	return (
		<SingleTripContext.Provider value={{ tripId, showHistory, setShowHistory }}>
            <div className='h-dvh bg-gray-100 font-sans' style={{ height: viewportHeight }}>
                <div className='mx-auto flex h-full max-w-lg flex-col pt-[env(safe-area-inset-top)]'>
                    <div className='shrink-0 px-4'>
                        <Header />
                        <TripSyncNotice tripId={tripId} />
                    </div>
                    <span role='status' className='sr-only'>{notice}</span>
                    <main ref={mainRef} tabIndex={-1} aria-label='行程內容'
                        className={`min-h-0 flex-1 px-4 py-3 outline-none ${activeTab === 'records' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
                        <div hidden={activeTab !== 'records'} className={activeTab === 'records' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                            <RecordList onEdit={openRecordForm} isActive={activeTab === 'records'} />
                        </div>
                        {activeTab === 'share' && <MoneyShare onRepay={openRecordForm} />}
                        {activeTab === 'members' && <AddressList />}
                        {hasDraft && <div hidden={activeTab !== 'entry'}>
                            <RecordForm key={draftKey} record={editingRecord}
                                onDirty={() => { dirty.current = true; }}
                                onBusyChange={value => { busy.current = value; }}
                                onCancel={() => finishDraft(false)} onSuccess={() => finishDraft(true)} />
                        </div>}
                    </main>
                    <TabBar activeTab={activeTab} setActiveTab={selectTab} />
                </div>
                <ConfirmModal isOpen={!!pendingRecord} title='捨棄目前草稿？'
                    message='開啟其他帳目會清除尚未送出的內容。' confirmText='捨棄並開啟' cancelText='保留草稿'
                    onConfirm={() => { if (pendingRecord) startEdit(pendingRecord); }}
                    onCancel={() => setPendingRecord(null)} isDestructive />
            </div>
        </SingleTripContext.Provider>
    );
}
