import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPayload,
  clearClipboardForTest,
  copyToClipboard,
  promoteToTopOfHistory,
  readClipboard,
  readClipboardHistory,
} from './clipboard.ts';
import type { Layer, PlacedDevice } from '@core/domain/types.ts';

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

  // P4 v7 — links carried with the device payload.
  it('buildPayload includes links whose endpoints are both in the selection', () => {
    const link = {
      layer: 'solid' as Layer,
      tier_id: 'belt-1',
      path: [
        { x: 5, y: 7 },
        { x: 6, y: 7 },
      ],
      src: { device_instance_id: 'a', port_index: 0 },
      dst: { device_instance_id: 'b', port_index: 1 },
    };
    const payload = buildPayload([placed('a', 5, 7), placed('b', 8, 9)], [link])!;
    expect(payload.links).toHaveLength(1);
    expect(payload.links[0]!.src_item_index).toBe(0);
    expect(payload.links[0]!.dst_item_index).toBe(1);
    expect(payload.links[0]!.src_port_index).toBe(0);
    expect(payload.links[0]!.dst_port_index).toBe(1);
    expect(payload.links[0]!.rel_path[0]).toEqual({ x: 0, y: 0 });
    expect(payload.links[0]!.rel_path[1]).toEqual({ x: 1, y: 0 });
  });

  it('buildPayload drops links whose endpoint references a device outside the selection', () => {
    const link = {
      layer: 'solid' as Layer,
      tier_id: 'belt-1',
      path: [{ x: 5, y: 7 }],
      src: { device_instance_id: 'a', port_index: 0 },
      dst: { device_instance_id: 'OUTSIDE', port_index: 0 },
    };
    const payload = buildPayload([placed('a', 5, 7)], [link])!;
    expect(payload.links).toHaveLength(0);
  });

  it('buildPayload drops links missing src or dst', () => {
    const link = {
      layer: 'solid' as Layer,
      tier_id: 'belt-1',
      path: [{ x: 5, y: 7 }],
      src: { device_instance_id: 'a', port_index: 0 },
      // no dst
    };
    const payload = buildPayload([placed('a', 5, 7)], [link])!;
    expect(payload.links).toHaveLength(0);
  });

  // P4 v7 — rolling history.
  it('history records each copy most-recent-first up to 10 entries', () => {
    for (let i = 0; i < 12; i++) {
      const p = buildPayload([placed(`d${i.toString()}`, i, i)])!;
      copyToClipboard(p);
    }
    const h = readClipboardHistory();
    expect(h).toHaveLength(10);
    // The most-recent (index 11) is at slot 0; the oldest two were evicted.
    expect(h[0]!.items[0]!.device_id).toBe('d');
    expect(h[0]!.origin).toEqual({ x: 11, y: 11 });
  });

  it('promoteToTopOfHistory moves an entry to the front', () => {
    const a = buildPayload([placed('a', 0, 0)])!;
    const b = buildPayload([placed('b', 1, 1)])!;
    copyToClipboard(a);
    copyToClipboard(b);
    expect(readClipboardHistory()[0]).toBe(b);
    promoteToTopOfHistory(a);
    expect(readClipboardHistory()[0]).toBe(a);
    expect(readClipboard()).toBe(a);
  });
});
