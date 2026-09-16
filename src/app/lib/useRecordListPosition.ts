'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { observeElementOffset, observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import type { prepareRecordRows } from './recordList';

interface ListPosition {
	id: string | null;
	offset: number;
	scrollTop: number;
	order: string[];
}

// Keep observers connected while the tab is hidden, but never cache its zero-size layout.
const observeVisibleRect: typeof observeElementRect<HTMLDivElement> = (instance, callback) =>
	observeElementRect(instance, rect => { if (rect.height > 0) callback(rect); });
const observeVisibleOffset: typeof observeElementOffset<HTMLDivElement> = (instance, callback) =>
	observeElementOffset(instance, (offset, scrolling) => {
		if (instance.scrollElement?.clientHeight) callback(offset, scrolling);
	});

export function useRecordListPosition(rows: ReturnType<typeof prepareRecordRows>, isActive: boolean, resetKey: string) {
	const parentRef = useRef<HTMLDivElement>(null);
	const saved = useRef<ListPosition | null>(null);
	const restoring = useRef(false);
	const [restoringView, setRestoringView] = useState(false);
	const sizes = useRef(new Map<string, number>());
	const order = useMemo(() => rows.map(row => row.record.id), [rows]);
	const previousResetKey = useRef(resetKey);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: rows.length,
		getItemKey: index => rows[index].record.id,
		getScrollElement: () => parentRef.current,
		estimateSize: index => 204 + (rows[index].separator ? 44 : 0),
		overscan: 5,
		observeElementRect: observeVisibleRect,
		observeElementOffset: observeVisibleOffset,
		measureElement: element => {
			const id = element.dataset.rowId!;
			const height = element.getBoundingClientRect().height;
			if (height > 0) sizes.current.set(id, height);
			return height || sizes.current.get(id) || 204;
		},
	});

	const capture = useCallback(() => {
		const parent = parentRef.current;
		if (!isActive || restoring.current || !parent?.clientHeight) return;
		const top = parent.getBoundingClientRect().top;
		const first = [...parent.querySelectorAll<HTMLElement>('[data-row-id]')]
			.find(element => element.getBoundingClientRect().bottom > top);
		saved.current = {
			id: first?.dataset.rowId ?? null,
			offset: first ? first.getBoundingClientRect().top - top : 0,
			scrollTop: parent.scrollTop,
			order,
		};
	}, [isActive, order]);

	useLayoutEffect(() => {
		const reset = previousResetKey.current !== resetKey;
		previousResetKey.current = resetKey;
		if (reset) saved.current = null;
		if (!isActive || !parentRef.current) return;
		const parent = parentRef.current;
		const position = saved.current;
		const currentIds = new Set(order);
		let targetId = position?.id;
		if (targetId && !currentIds.has(targetId)) {
			const oldIndex = position!.order.indexOf(targetId);
			targetId = position!.order.slice(oldIndex + 1).find(id => currentIds.has(id)) ??
				position!.order.slice(0, oldIndex).reverse().find(id => currentIds.has(id));
		}
		const targetIndex = targetId ? order.indexOf(targetId) : -1;
		restoring.current = true;
		setRestoringView(true);
		let frame = 0;
		let attempts = 0;
		let stableFrames = 0;
		let layoutObserver: ResizeObserver | null = null;
		const restore = () => {
			if (!parent.clientHeight) {
				// A short viewport or keyboard can leave no room for the list.
				// Resume on an actual layout change instead of spinning every frame.
				if (!layoutObserver) {
					layoutObserver = new ResizeObserver(() => {
						if (!parent.clientHeight) return;
						layoutObserver?.disconnect();
						layoutObserver = null;
						restore();
					});
					layoutObserver.observe(parent);
				}
				return;
			}
			let desired = reset ? 0 : position?.scrollTop ?? 0;
			if (targetIndex >= 0) {
				const offset = virtualizer.getOffsetForIndex(targetIndex, 'start');
				if (offset) desired = offset[0] - (position?.offset ?? 0);
				const element = [...parent.querySelectorAll<HTMLDivElement>('[data-row-id]')]
					.find(element => element.dataset.rowId === targetId);
				if (element) {
					virtualizer.measureElement(element);
					desired = parent.scrollTop + element.getBoundingClientRect().top - parent.getBoundingClientRect().top - (position?.offset ?? 0);
				}
			}
			desired = Math.max(0, Math.min(desired, parent.scrollHeight - parent.clientHeight));
			const settled = Math.abs(parent.scrollTop - desired) < 1;
			stableFrames = settled ? stableFrames + 1 : 0;
			virtualizer.scrollToOffset(desired);
			if (stableFrames < 2 && ++attempts < 12) {
				frame = requestAnimationFrame(restore);
			} else {
				restoring.current = false;
				setRestoringView(false);
				capture();
			}
		};
		restore();
		return () => { cancelAnimationFrame(frame); layoutObserver?.disconnect(); restoring.current = false; };
	}, [rows, order, isActive, resetKey, virtualizer, capture]);

	// Capture after virtual rows have been committed, as well as on native scrolling.
	useLayoutEffect(() => { capture(); });

	return { parentRef, virtualizer, capture, restoringView };
}
