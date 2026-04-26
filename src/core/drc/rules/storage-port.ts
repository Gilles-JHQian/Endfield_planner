/** STORAGE_PORT_001 — a storage I/O port (仓库存货 / 取货口) doesn't have at
 *  least one footprint cell adjacent to a storage-line base segment or a
 *  storage-line source pole.
 *
 *  Adjacency = the I/O port's footprint shares a 4-neighbour boundary with
 *  some other placed device whose `storage_line_role` is 'base' or 'pole'.
 *  Without that connection the storage port can't transfer items into the
 *  storage line network and effectively does nothing.
 *
 *  Skipped (data-gated dormant in P4) until the bundle has at least one
 *  device tagged `storage_line_role='port'` AND at least one tagged 'base'
 *  or 'pole'. Owner enables by adding the role tags via the device editor.
 *  See REQUIREMENT.md §10.12.
 */
import type { DataBundle } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

export const storagePort001: Rule = {
  id: 'STORAGE_PORT_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const hasPort = bundle.devices.some((d) => d.storage_line_role === 'port');
    const hasLine = bundle.devices.some(
      (d) => d.storage_line_role === 'base' || d.storage_line_role === 'pole',
    );
    const missing: DataPrereq[] = [];
    if (!hasPort) missing.push('storage_port_devices');
    if (!hasLine) missing.push('storage_line_devices');
    return missing;
  },
  run(_ctx: RuleContext): Issue[] {
    // Body deferred — once the role tags exist on real devices, owner-driven
    // tests will drive the implementation. The placeholder keeps the rule
    // registered so the lint panel surfaces it as ready-to-light-up.
    return [];
  },
};
