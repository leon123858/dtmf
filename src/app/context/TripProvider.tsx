'use client'; // 這是客戶端元件，因為它使用了 state 和 context

import React, { createContext, useState, ReactNode, useContext } from 'react';
import { Trip, TripContextType } from '@/app/lib/types';
import { MOCK_TRIP_STORE } from '@/app/lib/data';

// 建立 Context，並給予初始值 null
export const TripContext = createContext<TripContextType | null>(null);

// 建立一個 Hook，方便元件直接使用 Context，不用再寫 useContext(TripContext)
export const useTrips = () => {
	const context = useContext(TripContext);
	if (!context) {
		throw new Error('useTrips must be used within a TripProvider');
	}
	return context;
};

// Provider 元件
export const TripProvider = ({ children }: { children: ReactNode }) => {
	const [trips, setTrips] = useState<{ [key: string]: Trip }>(MOCK_TRIP_STORE);

	const getTripById = (id: string): Trip | undefined => {
		return trips[id];
	};

	const createTrip = (name: string): Trip => {
		const newTripId = `trip-${Date.now()}`;
		const newTrip: Trip = {
			id: newTripId,
			name: name,
			addressList: [],
			records: [],
			moneyShare: [],
		};
		const updatedTrips = { ...trips, [newTripId]: newTrip };
		setTrips(updatedTrips);
		console.log('Created new trip:', newTrip);
		return newTrip;
	};

	const updateTrip = (id: string, updatedData: Trip) => {
		setTrips((prev) => ({ ...prev, [id]: updatedData }));
	};

	const value = {
		trips,
		getTripById,
		createTrip,
		updateTrip,
	};

	return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
};
