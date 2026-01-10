'use client';

import React, { useState, useContext, useEffect } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useGraphQLClient } from '@/app/lib/tripApi/client';
import { longStringSimplify } from '@/app/lib/utils';
import { NewRecordInput, RecordCategory, ID } from '../lib/tripApi/types';
import { Decimal } from 'decimal.js';
import { RecordModalExtend } from './RecordModalExtend';
import { Record } from '../lib/types';

interface RecordModalProps {
	onClose: () => void;
	record:
		| Record // edit
		| (Omit<Record, 'id' | 'time' | 'isValid'> & { id?: ID; time?: string }) // payback
		| null; // create
}

function curTimeWithNoSecond() {
	const d = new Date();
	d.setSeconds(0, 0);
	return d.getTime();
}

export enum SplitMethod {
	AVERAGE = 'AVERAGE',
	FIXED = 'FIXED',
	PART = 'PART',
	FIX_BEFORE_NORMAL = 'FIX_BEFORE_NORMAL',
	TRANSFER = 'TRANSFER',
}

function recordCategory2SplitMethod(category: RecordCategory): SplitMethod {
	switch (category) {
		case RecordCategory.NORMAL:
			return SplitMethod.AVERAGE;
		case RecordCategory.FIX:
			return SplitMethod.FIXED;
		case RecordCategory.PART:
			return SplitMethod.PART;
		case RecordCategory.FIX_BEFORE_NORMAL:
			return SplitMethod.FIX_BEFORE_NORMAL;
		case RecordCategory.TRANSFER:
			return SplitMethod.TRANSFER;
		default:
			return SplitMethod.AVERAGE;
	}
}

function splitMethod2RecordCategory(splitMethod: SplitMethod): RecordCategory {
	switch (splitMethod) {
		case SplitMethod.AVERAGE:
			return RecordCategory.NORMAL;
		case SplitMethod.FIXED:
			return RecordCategory.FIX;
		case SplitMethod.PART:
			return RecordCategory.PART;
		case SplitMethod.FIX_BEFORE_NORMAL:
			return RecordCategory.FIX_BEFORE_NORMAL;
		case SplitMethod.TRANSFER:
			return RecordCategory.TRANSFER;
		default:
			return RecordCategory.NORMAL;
	}
}

// ex: 2025-08-11T01:01
function myISOLocalString(date: Date): string {
	if (!(date instanceof Date) || isNaN(date.getTime())) {
		console.error('Invalid date:', date);
		return '';
	}
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function calculateCustomSplitSum(customSplit: {
	[key: string]: number;
}): Decimal {
	// use Decimal.js for precise float arithmetic
	if (!customSplit || Object.keys(customSplit).length === 0) {
		return new Decimal(0);
	}
	return Object.values(customSplit).reduce((sum, value) => {
		const num = new Decimal(value || 0);
		if (num.isNaN() || !num.isFinite()) {
			return sum; // ignore invalid numbers
		}
		return sum.plus(num.abs());
	}, new Decimal(0));
}

export function countCustomSplitNotNegCnt(
	addressList: string[],
	customSplit: {
		[key: string]: number;
	}
): number {
	return addressList.filter((addr) => {
		if (customSplit[addr] === undefined) {
			// not exist means 0
			return true;
		}
		return customSplit[addr] >= 0;
	}).length;
}

export const RecordModal: React.FC<RecordModalProps> = ({
	onClose,
	record,
}) => {
	const {
		queries: { useTrip },
		mutations: { useCreateRecord, useUpdateRecord },
	} = useGraphQLClient();

	const context = useContext(SingleTripContext);
	const isSubmittingRef = React.useRef(false);
	const [showError, setShowError] = useState(false);
	const [errorText, setErrorText] = useState('');
	const { data: tripData } = useTrip(context?.tripId || '');
	const [name, setName] = useState(record?.name || '');
	const [amount, setAmount] = useState(
		record?.amount ? record.amount.toString() : ''
	);
	const [prePayAddress, setPrePayAddress] = useState(
		record?.prePayAddress || tripData?.addressList[0] || ''
	);
	const [shouldPayAddress, setShouldPayAddress] = useState<string[]>(
		record?.shouldPayAddress || []
	);
	const [time, setTime] = useState(
		record?.time ? Number(record.time) : curTimeWithNoSecond()
	);
	const [formattedTime, setFormattedTime] = useState<string>(() => {
		return myISOLocalString(new Date(curTimeWithNoSecond()));
	});
	const [splitMethod, setSplitMethod] = useState<SplitMethod>(
		recordCategory2SplitMethod(record?.category || RecordCategory.NORMAL)
	);
	const [customSplit, setCustomSplit] = useState<{ [key: string]: number }>(
		// Initialize with empty object or existing custom splits
		record?.shouldPayAddress && record?.extendPayMsg
			? record.shouldPayAddress.reduce(
					(acc, addr, index) => ({
						...acc,
						[addr]: record.extendPayMsg[index] || 0,
					}),
					{}
			  )
			: {}
	);

	const [oldRecordData, {}] = useState<NewRecordInput>({
		name,
		amount: parseFloat(amount) || 0,
		prePayAddress,
		time: new Date(time).getTime().toString(),
		shouldPayAddress,
		extendPayMsg: shouldPayAddress.map((addr) => customSplit[addr] || 0),
		category: splitMethod2RecordCategory(splitMethod),
	});

	const [updateRecord, {}] = useUpdateRecord(context?.tripId || '');
	const [createRecord, {}] = useCreateRecord(context?.tripId || '');

	useEffect(() => {
		const d = new Date(time);
		try {
			const formatted = myISOLocalString(d);
			if (formatted) {
				setFormattedTime(formatted);
			} else {
				console.error('Invalid date:', d);
			}
		} catch (error) {
			console.info('time: d', d);
			console.error('Error formatting time:', error);
		}
	}, [time]);

	// auto setShowError to false after 3 seconds
	useEffect(() => {
		if (showError) {
			const timer = setTimeout(() => {
				setShowError(false);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [showError]);

	if (!context) return null;
	if (!tripData) return null;

	const handleShouldPayToggle = (address: string) => {
		setShouldPayAddress((prev) =>
			prev.includes(address)
				? prev.filter((a) => a !== address)
				: [...prev, address]
		);
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (isSubmittingRef.current) return; // Prevent multiple submissions
		isSubmittingRef.current = true;
		const finalAmount = parseFloat(amount);
		if (
			isNaN(finalAmount) ||
			finalAmount <= 0 ||
			!name.trim() ||
			!prePayAddress ||
			shouldPayAddress.length === 0 ||
			isNaN(time)
		) {
			console.error('Invalid input:', {
				name,
				amount,
				prePayAddress,
				time,
				shouldPayAddress,
				customSplit,
				finalAmount,
			});

			setErrorText('請填寫所有欄位, 並確保金額有被分配。');
			setShowError(true);
			isSubmittingRef.current = false;
			return;
		}

		switch (splitMethod) {
			case SplitMethod.TRANSFER:
			case SplitMethod.FIXED:
				if (
					!calculateCustomSplitSum(customSplit).eq(
						new Decimal(Number(amount) || 0)
					)
				) {
					setErrorText('自訂分攤金額總和有誤，請檢查後再提交。');
					setShowError(true);
					isSubmittingRef.current = false;
					return;
				}
				break;
			case SplitMethod.PART:
				if (!calculateCustomSplitSum(customSplit).gt(0)) {
					setErrorText('請至少分配一份金額。');
					setShowError(true);
					isSubmittingRef.current = false;
					return;
				}
				break;
			case SplitMethod.FIX_BEFORE_NORMAL:
				if (
					!new Decimal(Number(amount) || 0)
						.minus(calculateCustomSplitSum(customSplit))
						.gte(0)
				) {
					setErrorText('指定金額總和不可超過總金額，請檢查後再提交。');
					setShowError(true);
					isSubmittingRef.current = false;
					return;
				}
				if (!(countCustomSplitNotNegCnt(shouldPayAddress, customSplit) > 0)) {
					setErrorText('請至少一人均分剩餘金額。');
					setShowError(true);
					isSubmittingRef.current = false;
					return;
				}
				break;
		}

		const newRecordData: NewRecordInput = {
			name,
			amount: finalAmount,
			prePayAddress,
			time: new Date(time).getTime().toString(),
			shouldPayAddress,
			extendPayMsg: shouldPayAddress.map((addr) => customSplit[addr] || 0),
			category: splitMethod2RecordCategory(splitMethod),
		};

		if (record?.id && record.id.length > 0) {
			// Editing existing record
			updateRecord({
				variables: {
					recordId: record.id,
					input: {
						old: oldRecordData,
						new: newRecordData,
					},
				},
			})
				.then(() => onClose())
				.catch((error) => {
					console.error('Error updating record:', error);
					setErrorText(
						'創建失敗，請稍後再試。(' +
							(error.message == 'invalid record input'
								? '輸入含非法字符'
								: error.message) +
							')'
					);
					setShowError(true);
				})
				.finally(() => {
					isSubmittingRef.current = false;
				});
		} else {
			// Creating new record
			createRecord({
				variables: {
					tripId: tripData.id,
					input: newRecordData,
				},
			})
				.then(() => onClose())
				.catch((error) => {
					console.error('Error creating record:', error);
					setErrorText(
						'新增失敗，請稍後再試。(' +
							(error.message == 'invalid record input'
								? '輸入含非法字符'
								: error.message) +
							')'
					);
					setShowError(true);
				})
				.finally(() => {
					isSubmittingRef.current = false;
				});
		}
	};

	const title = record ? '編輯帳目' : '新增帳目';
	const submitText = record ? '儲存變更' : '新增';

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start p-4 z-30 overflow-y-auto'>
			{showError && (
				// show error on top of modal
				<div
					className='fixed top-5 left-1/2 -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md z-50'
					role='alert'
				>
					<span className='block sm:inline'>{errorText}</span>
				</div>
			)}
			<div className='bg-white rounded-lg shadow-xl p-6 w-full max-w-md'>
				<h2 className='text-2xl font-bold mb-4'>{title}</h2>
				<form onSubmit={handleSubmit}>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							項目名稱
						</label>
						<input
							type='text'
							value={name}
							onChange={(e) => setName(e.target.value)}
							className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
							required
						/>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							日期
						</label>
						<input
							type='datetime-local'
							value={formattedTime}
							onChange={(e) => {
								const value = e.target.value;
								const d = new Date(value).getTime();
								if (d) {
									setTime(d);
								} else {
									console.log('err time be set:', value, d);
								}
							}}
							className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
							required
						/>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							金額
						</label>
						<input
							type='number'
							value={amount}
							min={0}
							step={0.01}
							onChange={(e) => setAmount(e.target.value)}
							className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
							required
						/>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							預付人{' '}
							{tripData.addressList.length == 0 && (
								<>
									<span className='text-red-500'>請先新增成員</span>
								</>
							)}
						</label>
						<select
							value={prePayAddress}
							onChange={(e) => setPrePayAddress(e.target.value)}
							className='shadow border rounded w-full py-2 px-3 text-gray-700'
						>
							{tripData.addressList.map((addr) => (
								<option key={addr} value={addr}>
									{longStringSimplify(addr)}
								</option>
							))}
						</select>
					</div>
					<div className='mb-4'>
						<label className='block text-gray-700 text-sm font-bold mb-2'>
							分攤人{' '}
							<label
								onClick={() => {
									setShouldPayAddress(tripData.addressList);
								}}
								className='rounded hover:bg-gray-200 transition-colors disabled:opacity-50 text-blue-500'
								aria-label='click all'
							>
								全選
							</label>
						</label>
						<div className='grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-md'>
							{tripData.addressList.map((addr) => (
								<label
									key={addr}
									className='flex items-center space-x-2 p-2 rounded-md hover:bg-gray-200 cursor-pointer'
								>
									<input
										type='checkbox'
										checked={shouldPayAddress.includes(addr)}
										onChange={() => handleShouldPayToggle(addr)}
										className='form-checkbox h-5 w-5 text-blue-600'
									/>
									<span className='text-gray-700'>
										{longStringSimplify(addr)}
									</span>
								</label>
							))}
						</div>
						<div className='mb-4'>
							<label
								htmlFor='split-method'
								className='block text-gray-700 text-sm font-bold mb-2'
							>
								分攤方式
							</label>
							<select
								id='split-method'
								value={splitMethod}
								onChange={(e) => {
									setSplitMethod(e.target.value as SplitMethod);
									// default value for each split method
									if (e.target.value === SplitMethod.TRANSFER) {
										const tmp = tripData.moneyShare.reduce((pre, cur) => {
											const inputItem = cur.input.find(
												(item) => item.address === prePayAddress
											);
											if (inputItem) {
												return {
													...pre,
													[cur.output.address]: inputItem.amount,
												};
											}
											return pre;
										}, {}) as {
											[key: string]: number;
										};
										if (Object.keys(tmp).length == 0) {
											setErrorText('該用戶尚無還款需求');
											setShowError(true);
										}
										setCustomSplit(tmp);
										setShouldPayAddress(Object.keys(tmp));
										setAmount(calculateCustomSplitSum(tmp).toFixed(2));
									} else {
										setCustomSplit({});
									}
								}}
								className='shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500'
							>
								<option value={SplitMethod.AVERAGE}>均分</option>
								<option value={SplitMethod.FIXED}>按金額</option>
								<option value={SplitMethod.PART}>按份數</option>
								<option value={SplitMethod.FIX_BEFORE_NORMAL}>
									指定金額後均分
								</option>
								<option value={SplitMethod.TRANSFER}>自動還款</option>
							</select>
						</div>
						<RecordModalExtend
							method={splitMethod}
							shouldPayAddress={shouldPayAddress}
							amount={Number(amount) || 0}
							customSplit={customSplit}
							setCustomSplit={setCustomSplit}
						/>
					</div>
					<div className='flex items-center justify-end space-x-3 mt-6'>
						<button
							type='button'
							onClick={onClose}
							className='bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300'
						>
							取消
						</button>
						<button
							type='submit'
							className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300'
						>
							{submitText}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
