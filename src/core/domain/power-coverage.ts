/** Shared power-AoE coverage computation.
 *
 *  Centralizes the geometry of "which devices sit inside which 供电桩 AoE
 *  square" so the DRC POWER_001 / POWER_002 rules and the editor's UI
 *  badges + POWER view-mode overlay all agree. Moved here from
 *  src/core/drc/rules/power-aoe.ts so non-DRC consumers don't need to
 *  cross the rule layer.
 *
 *  AoE geometry: a 供电桩's `power_aoe.edge × edge` square is centered on the
 *  pole's footprint center. For an even-edge AoE (12) on an even-footprint
 *  pole (2×2), the centered square spans `[center - edge/2, center + edge/2)`.
 *  Computed via integer bounds (no floats) so two computations don't drift.
 */
import { footprintCells } from './geometry.ts';
import type { Cell, PlacedDevice, Project } from './types.ts';
import type { Device } from '@core/data-loader/types.ts';
import type { DeviceLookup } from './occupancy.ts';

export interface SupplyZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly supplier_instance_id: string;
}

export interface PowerCoverage {
  /** AoE squares of every placed `device_supply` 供电桩. */
  readonly zones: readonly SupplyZone[];
  /** Instance ids of devices whose footprint is fully covered by ≥1 zone.
   *  A 供电桩 itself isn't required to be covered (it's the source). */
  readonly coveredInstanceIds: ReadonlySet<string>;
}

export function computePowerCoverage(project: Project, lookup: DeviceLookup): PowerCoverage {
  const zones: SupplyZone[] = [];
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    const zone = supplyZoneFor(placed, dev);
    if (zone) zones.push(zone);
  }

  const covered = new Set<string>();
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    // Suppliers don't need to sit in another pole's AoE — they self-power.
    if (dev.power_aoe?.purpose === 'device_supply') {
      covered.add(placed.instance_id);
      continue;
    }
    if (!dev.requires_power) continue;
    const cells = footprintCells(dev, placed);
    if (cells.every((c) => zones.some((z) => inZone(c, z)))) {
      covered.add(placed.instance_id);
    }
  }
  return { zones, coveredInstanceIds: covered };
}

function supplyZoneFor(placed: PlacedDevice, dev: Device): SupplyZone | null {
  if (dev.power_aoe?.purpose !== 'device_supply') return null;
  const cells = footprintCells(dev, placed);
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
  const halfFloor = Math.floor(dev.power_aoe.edge / 2);
  const halfCeil = Math.ceil(dev.power_aoe.edge / 2);
  const cx = (fxMin + fxMax + 1) / 2;
  const cy = (fyMin + fyMax + 1) / 2;
  return {
    minX: Math.floor(cx - halfFloor),
    maxX: Math.floor(cx + halfCeil) - 1,
    minY: Math.floor(cy - halfFloor),
    maxY: Math.floor(cy + halfCeil) - 1,
    supplier_instance_id: placed.instance_id,
  };
}

export function inZone(cell: Cell, zone: SupplyZone): boolean {
  return cell.x >= zone.minX && cell.x <= zone.maxX && cell.y >= zone.minY && cell.y <= zone.maxY;
}

/** Convenience: same AoE math but for a hypothetical not-yet-placed device.
 *  Used by the editor's GhostPreview to draw the candidate AoE box. */
export function previewSupplyZone(
  device: Pick<Device, 'footprint' | 'power_aoe'>,
  position: Cell,
  rotation: PlacedDevice['rotation'],
): SupplyZone | null {
  if (device.power_aoe?.purpose !== 'device_supply') return null;
  const stub: PlacedDevice = {
    instance_id: '__preview__',
    device_id: '__preview__',
    position,
    rotation,
    recipe_id: null,
  };
  return supplyZoneFor(stub, device as Device);
}

/** Same as previewSupplyZone but for `pole_link` repeaters — used by the
 *  POWER view overlay so 中继器 connectivity squares are visible too. */
export function previewPoleLinkZone(
  device: Pick<Device, 'footprint' | 'power_aoe'>,
  position: Cell,
  rotation: PlacedDevice['rotation'],
): SupplyZone | null {
  if (device.power_aoe?.purpose !== 'pole_link') return null;
  // Reuse the same math — only the purpose label differs.
  const swapped = {
    ...device,
    power_aoe: { ...device.power_aoe, purpose: 'device_supply' as const },
  };
  const stub: PlacedDevice = {
    instance_id: '__preview__',
    device_id: '__preview__',
    position,
    rotation,
    recipe_id: null,
  };
  return supplyZoneFor(stub, swapped as Device);
}
