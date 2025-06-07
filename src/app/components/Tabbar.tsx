'use client';

import React from 'react';

interface TabBarProps {
	activeTab: string;
	setActiveTab: (tab: 'records' | 'share' | 'members') => void;
}

export const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => {
	const tabs = [
		{ id: 'records' as const, label: '帳目' },
		{ id: 'share' as const, label: '分帳結果' },
		{ id: 'members' as const, label: '成員' },
	];

	return (
		<nav className='bg-white rounded-lg shadow-md p-2 flex justify-around'>
			{tabs.map((tab) => (
				<button
					key={tab.id}
					onClick={() => setActiveTab(tab.id)}
					className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${
						activeTab === tab.id
							? 'bg-blue-500 text-white shadow-sm'
							: 'text-gray-600 hover:bg-blue-100'
					}`}
				>
					{tab.label}
				</button>
			))}
		</nav>
	);
};
