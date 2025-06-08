'use client ';

import React from 'react';
import { Trip } from '@/app/lib/types';

interface SingleTripContextType {
	trip: Trip;
}
export const SingleTripContext =
	React.createContext<SingleTripContextType | null>(null);
