'use client';

import React from 'react';

interface SingleTripContextType {
	tripId: string;
	showHistory: boolean;
	setShowHistory: (value: boolean) => void;
}
export const SingleTripContext =
	React.createContext<SingleTripContextType | null>(null);
