export interface Record {
	id: string;
	name: string;
	amount: number;
	prePayAddress: string;
	shouldPayAddress: string[];
}

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
