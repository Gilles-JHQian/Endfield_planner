/** Renders every placed 供电桩 / 中继器 AoE square as an overlay shape.
 *  Active when the workspace's ViewMode === 'power'. Solid amber for
 *  device_supply zones, dashed teal for pole_link zones. The DeviceLayer
 *  and LinkLayer are dimmed independently in EditorPage when this overlay
 *  is visible so the AoEs read as the foreground.
 */
import { Group, Rect } from 'react-konva';
import { previewPoleLinkZone, previewSupplyZone } from '@core/domain/power-coverage.ts';
import type { PlacedDevice } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  devices: readonly PlacedDevice[];
  lookup: (id: string) => Device | undefined;
}

export function PowerOverlay({ devices, lookup }: Props) {
  const supplyZones: { key: string; x: number; y: number; w: number; h: number }[] = [];
  const linkZones: { key: string; x: number; y: number; w: number; h: number }[] = [];
  for (const placed of devices) {
    const dev = lookup(placed.device_id);
    if (!dev?.power_aoe) continue;
    const z =
      previewSupplyZone(dev, placed.position, placed.rotation) ??
      previewPoleLinkZone(dev, placed.position, placed.rotation);
    if (!z) continue;
    const rect = {
      key: placed.instance_id,
      x: z.minX * CELL_PX,
      y: z.minY * CELL_PX,
      w: (z.maxX - z.minX + 1) * CELL_PX,
      h: (z.maxY - z.minY + 1) * CELL_PX,
    };
    if (dev.power_aoe.purpose === 'device_supply') supplyZones.push(rect);
    else linkZones.push(rect);
  }

  return (
    <Group listening={false}>
      {supplyZones.map((r) => (
        <Rect
          key={`s-${r.key}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          stroke="#ff9a3d"
          strokeWidth={1.5}
          fill="rgba(255, 154, 61, 0.08)"
          opacity={0.85}
        />
      ))}
      {linkZones.map((r) => (
        <Rect
          key={`l-${r.key}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          stroke="#4ec9d3"
          strokeWidth={1.2}
          dash={[5, 4]}
          opacity={0.75}
        />
      ))}
    </Group>
  );
}
