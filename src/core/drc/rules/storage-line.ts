/** STORAGE_LINE_001 — a storage-line base segment is not directly or
 *  transitively connected (via 4-neighbour adjacency) to any storage-line
 *  source pole. Orphaned base segments carry nothing.
 *
 *  Computed as a connected-component analysis over the union of placed
 *  base + pole devices, with poles as roots; any base segment outside a
 *  pole's component flags. Implementation deferred — see REQUIREMENT.md
 *  §10.12 for the gating rationale.
 *
 *  Skipped (data-gated dormant in P4) until the bundle has at least one
 *  device tagged `storage_line_role='base'` AND one tagged 'pole'.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const storageLine001: Rule = {
  id: 'STORAGE_LINE_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const hasBase = bundle.devices.some((d) => d.storage_line_role === 'base');
    const hasPole = bundle.devices.some((d) => d.storage_line_role === 'pole');
    return hasBase && hasPole ? [] : ['storage_line_devices'];
  },
  run(_ctx: RuleContext): Issue[] {
    return [];
  },
};
