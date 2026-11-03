'use client';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { SingleTripContext } from '@/app/context/SingleTripProvider';
import { useUpdateTrip } from '@/app/lib/tripApi/hooks';
import { useAuth, useLoginDialog } from '@/app/context/AuthProvider';
import { useMember } from '@/app/context/MemberProvider';
import { ClockIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { SettingSwitch } from './SettingSwitch';
import { TripFavorite } from './TripFavorite';
import { ModalDialog } from './ModalDialog';

export function TripSettings({
	open,
	close,
}: {
	open: boolean;
	close: () => void;
}) {
	const context = useContext(SingleTripContext)!;
	const auth = useAuth();
	const login = useLoginDialog();
	const member = useMember();
	const update = useUpdateTrip();
	const labelId = useId();
	const [target, setTarget] = useState<boolean | null>(null);
	const confirmId = useId();
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	useEffect(() => {
		if (open) {
			setTarget(null);
			setError('');
			setSaved(false);
		}
	}, [open]);
	const save = async () => {
		if (pending.current || target === null) return;
		pending.current = true;
		setBusy(true);
		setError('');
		try {
			await update.execute({
				tripId: context.tripId,
				input: { private: target },
			});
			setTarget(null);
			setSaved(true);
			try {
				await context.synchronize();
			} catch {
				setError('已儲存，資料更新失敗，請重試。');
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : '隱私設定更新失敗。');
		} finally {
			pending.current = false;
			setBusy(false);
		}
	};
	const joined =
		member.status === 'ready' &&
		!context.binding.loading &&
		!context.binding.error &&
		!!context.binding.binding;
	const dialogClass =
		'm-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl backdrop:bg-black/50';
	const retry = async () => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		try {
			await context.synchronize();
			setError('');
		} catch {
			setError('已儲存，資料更新失敗，請重試。');
		} finally {
			pending.current = false;
			setBusy(false);
		}
	};
	return (
		<>
			<ModalDialog
				isOpen={open}
				onClose={close}
				busy={busy}
				labelId={labelId}
				className={dialogClass}
			>
				<h2 id={labelId} className='text-center text-xl font-bold'>
					旅程設定
				</h2>
				<p className='mt-2 text-center text-sm text-slate-500'>
					調整此旅程的顯示、收藏與存取方式，設定立即生效。
				</p>
				<div className='flex items-center gap-3 border-b border-slate-100 py-5'>
					<ClockIcon aria-hidden className='h-6 w-6 shrink-0 text-slate-500' />
					<div className='min-w-0 flex-1'>
						<label htmlFor='trip-history' className='font-semibold'>
							顯示紀錄歷史
						</label>
						<p id='history-description' className='mt-1 text-sm text-slate-500'>
							顯示舊版本與已刪除紀錄。
						</p>
					</div>
					<SettingSwitch
						id='trip-history'
						aria-label='顯示紀錄歷史'
						aria-describedby='history-description'
						checked={context.showHistory}
						onChange={(event) => context.setShowHistory(event.target.checked)}
					/>
				</div>
				<TripFavorite
					tripId={context.tripId}
					name={context.trip.data?.name ?? ''}
				/>
				<div className='space-y-2 py-5'>
					<div className='flex items-center gap-3'>
						<LockClosedIcon
							aria-hidden
							className='h-6 w-6 shrink-0 text-slate-500'
						/>
						<div className='min-w-0 flex-1'>
							<label htmlFor='trip-private' className='font-semibold'>
								私有旅程
							</label>
							<p
								id='privacy-description'
								className='mt-1 text-sm text-slate-500'
							>
								僅已加入的帳號可查看及修改。目前為
								{context.trip.data?.private ? '私有' : '公開'}旅程。
							</p>
						</div>
						<SettingSwitch
							id='trip-private'
							aria-label='私有旅程'
							aria-describedby='privacy-description privacy-permission'
							checked={!!context.trip.data?.private}
							disabled={
								auth.status !== 'authenticated' ||
								!joined ||
								busy ||
								member.pending > 0 ||
								(saved && !!error)
							}
							onChange={(event) => {
								setTarget(event.target.checked);
								setError('');
								setSaved(false);
							}}
						/>
					</div>
					<div id='privacy-permission' className='text-sm text-slate-600'>
						{auth.status !== 'authenticated' ? (
							<button
								className='underline'
								onClick={() => {
									close();
									login();
								}}
							>
								登入後設定隱私
							</button>
						) : !joined ? (
							<>
								<p>
									需先加入旅程才能設定隱私。請到成員分頁的「我的旅程身分」加入。
								</p>
								{member.status === 'error' && (
									<button
										className='underline'
										onClick={() => void member.retry()}
									>
										重試載入會員資料
									</button>
								)}
								{context.binding.error && (
									<button
										className='underline'
										onClick={() =>
											void context.binding.refresh().catch(() => {})
										}
									>
										重試載入旅程身分
									</button>
								)}
							</>
						) : null}
					</div>
				</div>
				{saved && (
					<p role='status' className='text-center text-green-700'>
						隱私設定已儲存。
					</p>
				)}
				{error && target === null && (
					<p role='alert' className='text-red-700'>
						{error}
					</p>
				)}
				{saved && error && (
					<button
						disabled={busy}
						className='block mx-auto underline disabled:opacity-40'
						onClick={() => void retry()}
					>
						重試更新資料
					</button>
				)}
				<button
					className='mx-auto mt-5 block rounded-lg border border-slate-300 px-6 py-2 disabled:opacity-40'
					disabled={busy}
					onClick={close}
				>
					關閉
				</button>
			</ModalDialog>
			<ModalDialog
				isOpen={open && target !== null}
				onClose={() => setTarget(null)}
				busy={busy}
				labelId={confirmId}
				className={dialogClass}
			>
				<h2 id={confirmId} className='text-center text-xl font-bold'>
					確認切換旅程隱私
				</h2>
				<p className='mt-5'>
					{target
						? '切換後，只有已加入此旅程的帳號可以查看及修改。僅收藏旅程的人不會取得存取權。目前無邀請功能，新帳號將無法自行加入。'
						: '改為公開後，知道旅程連結的人皆可查看與修改。'}
				</p>
				<p className='mt-3'>所有已加入的成員皆可修改旅程隱私。</p>
				{error && (
					<p role='alert' className='mt-3 text-red-700'>
						{error}
					</p>
				)}
				<div className='mt-6 flex justify-center gap-3'>
					<button
						autoFocus
						disabled={busy}
						onClick={() => setTarget(null)}
						className='rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-40'
					>
						取消
					</button>
					<button
						disabled={busy}
						onClick={() => void save()}
						className='rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-40'
					>
						{busy ? '儲存中...' : '確認切換'}
					</button>
				</div>
			</ModalDialog>
		</>
	);
}
