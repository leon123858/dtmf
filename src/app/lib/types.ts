import {
	RecordCategory as IRecordCategory,
	Record as IRecord,
	Address,
} from './tripApi/types';

export type Record = IRecord;
export type RecordCategory = IRecordCategory;

export interface MoneyShareItem {
	input: {
		amount: number;
		address: Address;
	}[];
	output: {
		amount: number;
		address: Address;
	};
}

export interface Trip {
	id: string;
	name: string;
	addresses: Address[];
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
