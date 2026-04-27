/** Live ghost preview for the place tool. Tracks the cursor cell and
 *  renders the device's rotated footprint at half opacity, color-coded by
 *  whether placement at that cell would succeed.
 *
 *  When the ghosted device is a 供电桩 / 中继器 (`power_aoe` set), an extra
 *  dashed AoE square is drawn around the cursor cell + the cells of any
 *  existing devices that would fall inside the AoE are shaded white so the
 *  owner can see what the new pole would cover before committing.
 *
 *  Per REQUIREMENT.md §5.1 F3 the ghost is mandatory and must paint within
 *  16ms — all overlays use simple Rect/Group nodes and only one Group is
 *  added per ghost render.
 */
import { Group, Rect } from 'react-konva';
import { footprintCells, rotatedBoundingBox } from '@core/domain/geometry.ts';
import {
  previewPoleLinkZone,
  previewSupplyZone,
  type SupplyZone,
} from '@core/domain/power-coverage.ts';
import type { Cell, PlacedDevice, Rotation } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';
import { PortMarkers } from './DeviceLayer.tsx';

interface Props {
  device: Device;
  cell: Cell;
  rotation: Rotation;
  /** 'valid' = placement would succeed; 'collision' = device-on-device or
   *  out-of-plot; 'warn' = currently unused, reserved for B8 DRC warnings. */
  status: 'valid' | 'collision' | 'warn';
  /** When ghosting a 供电桩, the existing project devices so the AoE preview
   *  can highlight which would be powered. Optional — when omitted the AoE
   *  box is still drawn but no covered-device shading appears. */
  existingDevices?: readonly PlacedDevice[];
  lookup?: (id: string) => Device | undefined;
}

const STATUS_FILL: Record<Props['status'], string> = {
  valid: 'rgba(109, 194, 109, 0.20)', // good green tint
  collision: 'rgba(232, 93, 74, 0.25)', // err red tint
  warn: 'rgba(240, 183, 58, 0.22)', // warn yellow tint
};
const STATUS_STROKE: Record<Props['status'], string> = {
  valid: '#6dc26d',
  collision: '#e85d4a',
  warn: '#f0b73a',
};

export function GhostPreview({ device, cell, rotation, status, existingDevices, lookup }: Props) {
  const bbox = rotatedBoundingBox(device, rotation);
  const aoeZone =
    previewSupplyZone(device, cell, rotation) ?? previewPoleLinkZone(device, cell, rotation);
  const aoeKind = device.power_aoe?.purpose ?? null;

  return (
    <Group listening={false}>
      {aoeZone && <AoeBox zone={aoeZone} kind={aoeKind} />}
      {aoeZone && aoeKind === 'device_supply' && existingDevices && lookup && (
        <CoveredHighlight zone={aoeZone} devices={existingDevices} lookup={lookup} />
      )}
      <Group x={cell.x * CELL_PX} y={cell.y * CELL_PX}>
        <Rect
          width={bbox.width * CELL_PX}
          height={bbox.height * CELL_PX}
          fill={STATUS_FILL[status]}
          stroke={STATUS_STROKE[status]}
          strokeWidth={2}
          dash={[6, 4]}
        />
        {/* P4 v7: ghost shows the same I/O port triangles as a placed device
         *  so owners see port directions before committing. PortMarkers needs
         *  a `placed` stub at the cursor position. */}
        <Group opacity={0.55}>
          <PortMarkers
            placed={{
              instance_id: '__ghost__',
              device_id: device.id,
              position: cell,
              rotation,
              recipe_id: null,
            }}
            device={device}
          />
        </Group>
      </Group>
    </Group>
  );
}

export function AoeBox({
  zone,
  kind,
}: {
  zone: SupplyZone;
  kind: 'device_supply' | 'pole_link' | null;
}) {
  const x = zone.minX * CELL_PX;
  const y = zone.minY * CELL_PX;
  const w = (zone.maxX - zone.minX + 1) * CELL_PX;
  const h = (zone.maxY - zone.minY + 1) * CELL_PX;
  const stroke = kind === 'device_supply' ? '#ff9a3d' : '#4ec9d3';
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      stroke={stroke}
      strokeWidth={1.5}
      dash={[4, 3]}
      opacity={0.7}
    />
  );
}

/** Shade existing devices whose footprint touches the candidate AoE.
 *  P4 v6: matches `computePowerCoverage` — any one footprint cell inside the
 *  AoE is enough (was `cells.every` until v5; the preview was the last
 *  consumer still using the strict v4 predicate).
 *
 *  P4 v7.9: exported so MoveModeGhost can reuse the same shading when a
 *  power-diffuser is being dragged inside move mode. */
export function CoveredHighlight({
  zone,
  devices,
  lookup,
}: {
  zone: SupplyZone;
  devices: readonly PlacedDevice[];
  lookup: (id: string) => Device | undefined;
}) {
  const rects: { x: number; y: number; w: number; h: number; key: string }[] = [];
  for (const placed of devices) {
    const dev = lookup(placed.device_id);
    if (!dev?.requires_power) continue;
    const cells = footprintCells(dev, placed);
    if (
      !cells.some(
        (c) => c.x >= zone.minX && c.x <= zone.maxX && c.y >= zone.minY && c.y <= zone.maxY,
      )
    ) {
      continue;
    }
    const bbox = rotatedBoundingBox(dev, placed.rotation);
    rects.push({
      x: placed.position.x * CELL_PX,
      y: placed.position.y * CELL_PX,
      w: bbox.width * CELL_PX,
      h: bbox.height * CELL_PX,
      key: placed.instance_id,
    });
  }
  return (
    <>
      {rects.map((r) => (
        <Rect
          key={r.key}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="rgba(255, 255, 255, 0.18)"
          listening={false}
        />
      ))}
    </>
  );
}
