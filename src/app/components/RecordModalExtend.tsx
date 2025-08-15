'use client';

import React from 'react';
import { SplitMethod, calculateCustomSplitSum } from './RecordModal';
import { longStringSimplify } from '@/app/lib/utils';
import { Decimal } from 'decimal.js';

interface RecordModalExtendProps {
	method: SplitMethod;
	shouldPayAddress: string[];
	amount: number;
	customSplit: { [key: string]: number };
	setCustomSplit: React.Dispatch<
		React.SetStateAction<{ [key: string]: number }>
	>;
}

export const RecordModalExtend: React.FC<RecordModalExtendProps> = ({
	method,
	shouldPayAddress,
	amount,
	customSplit,
	setCustomSplit,
}) => {
	switch (method) {
		case SplitMethod.AVERAGE:
			return <div></div>;
		case SplitMethod.FIXED:
			return (
				<div className='p-4 bg-gray-100 rounded-lg border border-gray-200'>
					<h4 className='font-semibold mb-3 text-gray-800'>自訂分攤金額</h4>
					<div className='space-y-3'>
						{shouldPayAddress.map((addr) => (
							<div key={addr} className='flex items-center justify-between'>
								<label htmlFor={`split-${addr}`} className='text-gray-700'>
									{longStringSimplify(addr)}
								</label>
								<input
									id={`split-${addr}`}
									type='number'
									placeholder='0.00'
									min='0'
									step='1'
									value={customSplit[addr] || ''}
									onChange={(e) =>
										setCustomSplit((prev) => ({
											...prev,
											[addr]: parseFloat(e.target.value) || 0,
										}))
									}
									className='shadow-sm appearance-none border rounded w-32 py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500'
								/>
							</div>
						))}
					</div>
					<div className='mt-4 pt-3 border-t border-gray-300 flex justify-between text-sm font-medium'>
						<span className='text-gray-600'>已分配總額:</span>
						<span
							className={
								calculateCustomSplitSum(customSplit).eq(
									new Decimal(Number(amount) || 0)
								)
									? 'text-green-600'
									: 'text-red-600'
							}
						>
							{calculateCustomSplitSum(customSplit).toFixed(2)} /{' '}
							{Decimal(Number(amount) || 0).toFixed(2)}
						</span>
					</div>
				</div>
			);
		case SplitMethod.PART:
			return (
				<div className='p-4 bg-gray-100 rounded-lg border border-gray-200'>
					<h4 className='font-semibold mb-3 text-gray-800'>自訂分攤金額</h4>
					<div className='space-y-3'>
						{shouldPayAddress.map((addr) => (
							<div key={addr} className='flex items-center justify-between'>
								<label htmlFor={`split-${addr}`} className='text-gray-700'>
									{longStringSimplify(addr)}
								</label>
								<input
									id={`split-${addr}`}
									type='number'
									placeholder='0'
									min='0'
									step='1'
									value={customSplit[addr] || ''}
									onChange={(e) =>
										setCustomSplit((prev) => ({
											...prev,
											[addr]: parseFloat(e.target.value) || 0,
										}))
									}
									className='shadow-sm appearance-none border rounded w-32 py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500'
								/>
							</div>
						))}
					</div>
					<div className='mt-4 pt-3 border-t border-gray-300 flex justify-between text-sm font-medium'>
						<span className='text-gray-600'>已分配份數:</span>
						<span
							className={
								calculateCustomSplitSum(customSplit).gt(0)
									? 'text-green-600'
									: 'text-red-600'
							}
						>
							{calculateCustomSplitSum(customSplit).toFixed(0)}
						</span>
					</div>
				</div>
			);
		default:
			return <div></div>;
	}
};
