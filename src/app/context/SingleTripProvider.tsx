'use client ';

import React from 'react';

interface SingleTripContextType {
	tripId: string;
}
export const SingleTripContext =
	React.createContext<SingleTripContextType | null>(null);
