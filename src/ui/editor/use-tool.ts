/** Active editor tool. Each tool changes how mouse events on the canvas are
 *  interpreted (click to select / click to place / drag to draw a belt /
 *  etc.). Keyboard shortcuts:
 *  - V = select; Esc = also back to select
 *  - B / E = belt tool; P / Q = pipe tool (B/P preserved for muscle memory,
 *    Q/E added in P3 because they're easier to reach with one hand)
 *  - X / Delete = delete (P3 will replace X with box-select)
 *  - R = rotate current placement ghost (90° CW)
 */
import { useEffect, useState } from 'react';
import type { Device, DeviceCategory } from '@core/data-loader/types.ts';

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; device: Device; rotation: 0 | 90 | 180 | 270 }
  | { kind: 'belt' }
  | { kind: 'pipe' }
  | { kind: 'delete' };

export const DEFAULT_TOOL: Tool = { kind: 'select' };

export interface ToolApi {
  tool: Tool;
  setSelect: () => void;
  setPlace: (device: Device) => void;
  setBelt: () => void;
  setPipe: () => void;
  setDelete: () => void;
  rotatePlace: () => void;
}

export function useTool(): ToolApi {
  const [tool, setTool] = useState<Tool>(DEFAULT_TOOL);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Ignore keypresses while typing in an input/textarea.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') setTool({ kind: 'select' });
      else if (e.key === 'v' || e.key === 'V') setTool({ kind: 'select' });
      else if (e.key === 'b' || e.key === 'B' || e.key === 'e' || e.key === 'E')
        setTool({ kind: 'belt' });
      else if (e.key === 'p' || e.key === 'P' || e.key === 'q' || e.key === 'Q')
        setTool({ kind: 'pipe' });
      else if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') setTool({ kind: 'delete' });
      else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        // R only rotates the currently picked-place device's ghost preview.
        // Selected-placed-device rotation goes through the inspector / a
        // different shortcut once selection lands.
        setTool((t) => (t.kind === 'place' ? { ...t, rotation: nextRot(t.rotation) } : t));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    tool,
    setSelect: () => setTool({ kind: 'select' }),
    setPlace: (device) => setTool({ kind: 'place', device, rotation: 0 }),
    setBelt: () => setTool({ kind: 'belt' }),
    setPipe: () => setTool({ kind: 'pipe' }),
    setDelete: () => setTool({ kind: 'delete' }),
    rotatePlace: () =>
      setTool((t) => (t.kind === 'place' ? { ...t, rotation: nextRot(t.rotation) } : t)),
  };
}

function nextRot(r: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  return ((r + 90) % 360) as 0 | 90 | 180 | 270;
}

/** Categories whose devices show in the library. Re-exported here so the
 *  Rail and Library components share a single source. */
export const LIBRARY_CATEGORIES: readonly DeviceCategory[] = [
  'miner',
  'basic_production',
  'synthesis',
  'storage',
  'logistics',
  'power',
  'utility',
  'planting',
  'combat',
];
