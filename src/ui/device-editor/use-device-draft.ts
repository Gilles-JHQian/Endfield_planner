/** Per-device draft state for the §5.4 device editor.
 *
 *  Picks one Device from the bundle and keeps a mutable copy alongside the
 *  canonical version so we can show "(modified)" vs canonical, reset to
 *  bundle, and ultimately serialize the new full devices.json.
 *
 *  Field updates are immutable and partial; geometric edits (port add /
 *  remove / move) get their own helpers so the device editor's handlers
 *  don't have to spread-merge nested arrays themselves.
 */
import { useCallback, useState } from 'react';
import type { Device, Port } from '@core/data-loader/types.ts';

export interface DeviceDraftApi {
  draft: Device | null;
  dirty: boolean;
  load: (device: Device) => void;
  reset: () => void;
  setField: <K extends keyof Device>(key: K, value: Device[K]) => void;
  addPort: (port: Port) => void;
  removePort: (port_index: number) => void;
  updatePort: (port_index: number, patch: Partial<Port>) => void;
}

export function useDeviceDraft(): DeviceDraftApi {
  const [original, setOriginal] = useState<Device | null>(null);
  const [draft, setDraft] = useState<Device | null>(null);

  const load = useCallback((device: Device): void => {
    setOriginal(device);
    setDraft(device);
  }, []);

  const reset = useCallback((): void => {
    setDraft(original);
  }, [original]);

  const setField = useCallback(<K extends keyof Device>(key: K, value: Device[K]): void => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }, []);

  const addPort = useCallback((port: Port): void => {
    setDraft((d) => (d ? { ...d, io_ports: [...d.io_ports, port] } : d));
  }, []);

  const removePort = useCallback((port_index: number): void => {
    setDraft((d) => (d ? { ...d, io_ports: d.io_ports.filter((_, i) => i !== port_index) } : d));
  }, []);

  const updatePort = useCallback((port_index: number, patch: Partial<Port>): void => {
    setDraft((d) => {
      if (!d) return d;
      const next = d.io_ports.map((p, i) => (i === port_index ? { ...p, ...patch } : p));
      return { ...d, io_ports: next };
    });
  }, []);

  const dirty = draft !== null && original !== null && !shallowEqual(draft, original);

  return { draft, dirty, load, reset, setField, addPort, removePort, updatePort };
}

function shallowEqual(a: Device, b: Device): boolean {
  // Cheap check via JSON stringify — Device is small, perf doesn't matter here.
  return JSON.stringify(a) === JSON.stringify(b);
}
