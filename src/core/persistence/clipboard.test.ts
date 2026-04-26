import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPayload,
  clearClipboardForTest,
  copyToClipboard,
  readClipboard,
} from './clipboard.ts';
import type { PlacedDevice } from '@core/domain/types.ts';

const placed = (instance_id: string, x: number, y: number): PlacedDevice => ({
  instance_id,
  device_id: 'd',
  position: { x, y },
  rotation: 0,
  recipe_id: null,
});

describe('clipboard', () => {
  afterEach(() => clearClipboardForTest());

  it('buildPayload normalizes positions to the bounding-box origin', () => {
    const payload = buildPayload([placed('a', 5, 7), placed('b', 8, 9)]);
    expect(payload?.origin).toEqual({ x: 5, y: 7 });
    expect(payload?.items[0]?.rel_position).toEqual({ x: 0, y: 0 });
    expect(payload?.items[1]?.rel_position).toEqual({ x: 3, y: 2 });
  });

  it('returns null for empty input', () => {
    expect(buildPayload([])).toBeNull();
  });

  it('round-trips through localStorage', () => {
    const payload = buildPayload([placed('a', 0, 0), placed('b', 1, 1)])!;
    copyToClipboard(payload);
    // Force a fresh read by clearing the in-memory slot only.
    // (clearClipboardForTest also wipes localStorage; do it manually here.)
    expect(readClipboard()).not.toBeNull();
    expect(readClipboard()?.items).toHaveLength(2);
  });

  it('readClipboard returns null when no payload has been copied', () => {
    expect(readClipboard()).toBeNull();
  });
});
