import {
	RecordCategory as IRecordCategory,
	Record as IRecord,
} from './tripApi/types';

export type Record = IRecord;
export type RecordCategory = IRecordCategory;

export interface MoneyShareItem {
	input: {
		amount: number;
		address: string;
	}[];
	output: {
		amount: number;
		address: string;
	};
}

export interface Trip {
	id: string;
	name: string;
	addressList: string[];
	records: Record[];
	moneyShare: MoneyShareItem[];
}

// 用於 Context 的類型
export interface TripContextType {
	trips: { [key: string]: Trip };
	getTripById: (id: string) => Trip | undefined;
	createTrip: (name: string) => Trip;
	updateTrip: (id: string, updatedData: Trip) => void;
}
