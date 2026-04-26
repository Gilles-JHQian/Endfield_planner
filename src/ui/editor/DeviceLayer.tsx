/** Renders every PlacedDevice as a Konva Group inside the canvas content
 *  layer. Footprint outline + display-font initial glyph + recipe-bound
 *  amber dot in the corner.
 *
 *  Color follows the device's "primary layer":
 *  - has_fluid_interface → teal accent
 *  - otherwise → amber accent
 */
import { Group, Rect, Text } from 'react-konva';
import { footprintCells, rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { PlacedDevice } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  devices: readonly PlacedDevice[];
  lookup: (device_id: string) => Device | undefined;
  selectedInstanceId?: string | null;
}

export function DeviceLayer({ devices, lookup, selectedInstanceId }: Props) {
  return (
    <>
      {devices.map((placed) => {
        const dev = lookup(placed.device_id);
        if (!dev) return null;
        return (
          <DeviceShape
            key={placed.instance_id}
            placed={placed}
            device={dev}
            selected={placed.instance_id === selectedInstanceId}
          />
        );
      })}
    </>
  );
}

function DeviceShape({
  placed,
  device,
  selected,
}: {
  placed: PlacedDevice;
  device: Device;
  selected: boolean;
}) {
  const bbox = rotatedBoundingBox(device, placed.rotation);
  const x = placed.position.x * CELL_PX;
  const y = placed.position.y * CELL_PX;
  const w = bbox.width * CELL_PX;
  const h = bbox.height * CELL_PX;
  const isFluid = device.has_fluid_interface;
  const accent = isFluid ? '#4ec9d3' : '#ff9a3d';
  const initial = device.id.split('-')[0]?.[0]?.toUpperCase() ?? '?';

  return (
    <Group x={x} y={y}>
      {/* Body — semi-opaque surface-2 with hairline accent border. */}
      <Rect width={w} height={h} fill="#181d23" stroke={accent} strokeWidth={1} opacity={0.95} />
      {/* Inner grid pattern marker per design — single dotted center indicator. */}
      <Text
        x={0}
        y={h / 2 - 9}
        width={w}
        align="center"
        text={initial}
        fontFamily="Rajdhani, Barlow Condensed, sans-serif"
        fontSize={Math.max(12, Math.min(w, h) / 2)}
        fontStyle="bold"
        fill={accent}
        listening={false}
      />
      {/* Recipe-bound badge — small amber dot in top-right corner. */}
      {placed.recipe_id !== null && (
        <Rect x={w - 6} y={2} width={4} height={4} fill="#ff9a3d" listening={false} />
      )}
      {/* Selection brackets — 4 8px corner pieces. */}
      {selected && <SelectionBrackets w={w} h={h} />}
    </Group>
  );
}

function SelectionBrackets({ w, h }: { w: number; h: number }) {
  const b = 8;
  const stroke = '#ff9a3d';
  const sw = 2;
  return (
    <Group listening={false}>
      {/* TL */}
      <Rect x={-1} y={-1} width={b} height={sw} fill={stroke} />
      <Rect x={-1} y={-1} width={sw} height={b} fill={stroke} />
      {/* TR */}
      <Rect x={w - b + 1} y={-1} width={b} height={sw} fill={stroke} />
      <Rect x={w - 1} y={-1} width={sw} height={b} fill={stroke} />
      {/* BL */}
      <Rect x={-1} y={h - sw + 1} width={b} height={sw} fill={stroke} />
      <Rect x={-1} y={h - b + 1} width={sw} height={b} fill={stroke} />
      {/* BR */}
      <Rect x={w - b + 1} y={h - sw + 1} width={b} height={sw} fill={stroke} />
      <Rect x={w - 1} y={h - b + 1} width={sw} height={b} fill={stroke} />
    </Group>
  );
}

/** Returns the placed-device whose footprint covers `cell`, or null. */
export function findDeviceAtCell(
  devices: readonly PlacedDevice[],
  lookup: (id: string) => Device | undefined,
  cell: { x: number; y: number },
): PlacedDevice | null {
  for (const placed of devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const c of footprintCells(dev, placed)) {
      if (c.x === cell.x && c.y === cell.y) return placed;
    }
  }
  return null;
}
