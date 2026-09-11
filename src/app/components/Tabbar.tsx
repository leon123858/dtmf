'use client';

import { List, ChartNoAxesCombined, Users, SquarePen } from 'lucide-react';

export type TripTab = 'records' | 'share' | 'members' | 'entry';
const tabs = [
    { id: 'records', label: '帳目', icon: List },
    { id: 'share', label: '分帳', icon: ChartNoAxesCombined },
    { id: 'members', label: '成員', icon: Users },
    { id: 'entry', label: '記帳', icon: SquarePen },
] as const;

export function TabBar({ activeTab, setActiveTab }: {
    activeTab: TripTab; setActiveTab: (tab: TripTab) => void;
}) {
    return <nav aria-label='行程導覽' className='grid shrink-0 grid-cols-4 border-t border-gray-200 bg-white px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]'>
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type='button'
            aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium ${activeTab === id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            <Icon size={20} aria-hidden='true' />{label}
        </button>)}
    </nav>;
}
