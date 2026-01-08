'use client';

import React from 'react';
import {
	SplitMethod,
	calculateCustomSplitSum,
	countCustomSplitNotNegCnt,
} from './RecordModal';
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
		case SplitMethod.TRANSFER:
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
		case SplitMethod.FIX_BEFORE_NORMAL:
			return (
				<div className='p-4 bg-gray-100 rounded-lg border border-gray-200'>
					<h4 className='font-semibold mb-3 text-gray-800'>先指定金額</h4>
					<div className='space-y-3'>
						{shouldPayAddress.map((addr) => (
							<div key={addr} className='flex items-center justify-between'>
								<label htmlFor={`split-${addr}`} className='text-gray-700'>
									{longStringSimplify(addr)}
								</label>
								<input
									id={`split-${addr}`}
									type='number'
									placeholder='僅參與均分'
									min='0'
									step='1'
									value={Math.abs(customSplit[addr]) || ''}
									onChange={(e) =>
										setCustomSplit((prev) => {
											if (e.target.value === '') {
												return {
													...prev,
													[addr]: 0,
												};
											}
											if (prev[addr] < 0) {
												// 保持負值表示不參與均分
												return {
													...prev,
													[addr]: -Math.abs(parseFloat(e.target.value) || 0),
												};
											}
											return {
												...prev,
												[addr]: parseFloat(e.target.value) || 0,
											};
										})
									}
									className='shadow-sm appearance-none border rounded w-32 py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500'
								/>
							</div>
						))}
					</div>
					<div className='mt-4 pt-3 border-t border-gray-300 flex justify-between text-sm font-medium'>
						<span className='text-gray-600'>未分配金額:</span>
						<span
							className={
								new Decimal(Number(amount) || 0)
									.minus(calculateCustomSplitSum(customSplit))
									.gte(0)
									? 'text-green-600'
									: 'text-red-600'
							}
						>
							{new Decimal(Number(amount) || 0)
								.minus(calculateCustomSplitSum(customSplit))
								.toFixed(1)}
						</span>
					</div>
					<div className='mt-4 pt-3 border-t border-gray-300 flex justify-between text-sm font-medium'>
						<span className='text-gray-600'>參與均分人數:</span>
						<span
							className={
								countCustomSplitNotNegCnt(shouldPayAddress, customSplit) > 0
									? 'text-green-600'
									: 'text-red-600'
							}
						>
							{countCustomSplitNotNegCnt(shouldPayAddress, customSplit)} 人
						</span>
					</div>
					<label className='block text-gray-700 text-sm font-bold mb-2'>
						參與均分人{' '}
						<label
							onClick={() => {
								const allSelected =
									countCustomSplitNotNegCnt(shouldPayAddress, customSplit) ===
									shouldPayAddress.length;
								if (allSelected) {
									// 全部取消選取
									const newSplit: { [key: string]: number } = {};
									shouldPayAddress.forEach((addr) => {
										newSplit[addr] = -Math.abs(customSplit[addr] || 0); // 設為負值表示不參與均分
									});
									setCustomSplit(newSplit);
								} else {
									// 全部選取
									const newSplit: { [key: string]: number } = {};
									shouldPayAddress.forEach((addr) => {
										newSplit[addr] = Math.abs(customSplit[addr] || 0); // 設為正值表示參與均分
									});
									setCustomSplit(newSplit);
								}
							}}
							className='rounded hover:bg-gray-200 transition-colors disabled:opacity-50 text-blue-500'
							aria-label='click all'
						>
							全選
						</label>
					</label>
					<div className='grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-md'>
						{shouldPayAddress.map((addr) => (
							<label
								key={addr}
								className='flex items-center space-x-2 p-2 rounded-md hover:bg-gray-200 cursor-pointer'
							>
								<input
									type='checkbox'
									checked={
										customSplit[addr] >= 0 || customSplit[addr] === undefined
									}
									disabled={
										customSplit[addr] === 0 || customSplit[addr] === undefined
									}
									onChange={() => {
										setCustomSplit((prev) => {
											const prevTarget = prev[addr];
											// check is number
											if (Number.isNaN(prevTarget)) {
												return prev;
											}
											return { ...prev, [addr]: -prev[addr] };
										});
									}}
									className='form-checkbox h-5 w-5 text-blue-600'
								/>
								<span className='text-gray-700'>
									{longStringSimplify(addr)}
								</span>
							</label>
						))}
					</div>
				</div>
			);
		default:
			return <div></div>;
	}
};
