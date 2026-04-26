/** POWER_001 — placed device that requires power isn't inside any
 *  device_supply 供电桩's AoE square (REQUIREMENT.md §4.6).
 *
 *  AoE geometry: a 供电桩's `power_aoe.edge × edge` square is centered on
 *  the pole's footprint center. For an even-edge AoE (12) on an even-footprint
 *  pole (2×2), the centered square spans `[center_x - edge/2, center_x + edge/2)`.
 *  We compute "is cell c covered" via integer bounds rather than floating
 *  centers to keep the math deterministic.
 *
 *  Skipped if no device in the bundle has `power_aoe.purpose === 'device_supply'`.
 *  (中继器 / pole_link AoEs only extend pole-to-pole connectivity, NOT supply.)
 */
import { footprintCells } from '@core/domain/geometry.ts';
import type { Cell, PlacedDevice } from '@core/domain/types.ts';
import type { DataBundle, Device } from '@core/data-loader/types.ts';
import type { DataPrereq, Issue, Rule, RuleContext } from '../types.ts';

interface SupplyZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function supplyZoneFor(placed: PlacedDevice, dev: Device): SupplyZone | null {
  if (dev.power_aoe?.purpose !== 'device_supply') return null;
  const cells = footprintCells(dev, placed);
  // Footprint is rectangular so min/max give us the bounding box without sorting.
  let fxMin = Infinity;
  let fxMax = -Infinity;
  let fyMin = Infinity;
  let fyMax = -Infinity;
  for (const c of cells) {
    if (c.x < fxMin) fxMin = c.x;
    if (c.x > fxMax) fxMax = c.x;
    if (c.y < fyMin) fyMin = c.y;
    if (c.y > fyMax) fyMax = c.y;
  }
  // The AoE is a square of `edge` cells centered on the footprint center.
  // For a 2x2 footprint at (3,3)-(4,4), center is (4,4) and a 12-edge AoE covers
  // x∈[4-6, 4+6) = [-2, 10), y∈[-2, 10). Half-edge below+inclusive, half-edge above-exclusive.
  const halfFloor = Math.floor(dev.power_aoe.edge / 2);
  const halfCeil = Math.ceil(dev.power_aoe.edge / 2);
  const cx = (fxMin + fxMax + 1) / 2;
  const cy = (fyMin + fyMax + 1) / 2;
  return {
    minX: Math.floor(cx - halfFloor),
    maxX: Math.floor(cx + halfCeil) - 1,
    minY: Math.floor(cy - halfFloor),
    maxY: Math.floor(cy + halfCeil) - 1,
  };
}

function inZone(cell: Cell, zone: SupplyZone): boolean {
  return cell.x >= zone.minX && cell.x <= zone.maxX && cell.y >= zone.minY && cell.y <= zone.maxY;
}

export const power001: Rule = {
  id: 'POWER_001',
  severity: 'error',
  requires_data: (bundle: DataBundle): DataPrereq[] => {
    const hasSupply = bundle.devices.some((d) => d.power_aoe?.purpose === 'device_supply');
    return hasSupply ? [] : ['power_aoe_supply'];
  },
  run({ project, lookup }: RuleContext): Issue[] {
    // Build supply zones once from the placed 供电桩 set.
    const zones: SupplyZone[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      const zone = supplyZoneFor(placed, dev);
      if (zone) zones.push(zone);
    }

    const issues: Issue[] = [];
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev?.requires_power) continue;
      // 供电桩 themselves don't need to sit in another pole's AoE — skip them.
      if (dev.power_aoe?.purpose === 'device_supply') continue;
      const cells = footprintCells(dev, placed);
      const covered = cells.every((c) => zones.some((z) => inZone(c, z)));
      if (!covered) {
        issues.push({
          rule_id: 'POWER_001',
          severity: 'error',
          message_zh_hans: `设备 ${dev.display_name_zh_hans} 不在任何供电桩的 AoE 内`,
          message_en: `Device ${dev.display_name_en ?? dev.id} is outside every power pole AoE`,
          cells: [placed.position],
          device_instance_id: placed.instance_id,
        });
      }
    }
    return issues;
  },
};
