/** Recompute the DRC report when project, bundle, or lookup change.
 *
 *  Synchronous for now — runDrc is fast enough at MVP scale (200 devices, 17
 *  rules, ~ms). When the editor crosses ~1000 devices we'll move runDrc to a
 *  Web Worker behind this same hook so the UI shape doesn't change.
 */
import { useMemo } from 'react';
import { runDrc } from '@core/drc/index.ts';
import type { DrcReport } from '@core/drc/index.ts';
import type { DataBundle } from '@core/data-loader/types.ts';
import type { Project } from '@core/domain/types.ts';
import type { DeviceLookup } from '@core/domain/occupancy.ts';

export function useDrc(project: Project, bundle: DataBundle, lookup: DeviceLookup): DrcReport {
  return useMemo(() => runDrc(project, bundle, lookup), [project, bundle, lookup]);
}
