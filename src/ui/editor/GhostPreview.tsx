/** Live ghost preview for the place tool. Tracks the cursor cell and
 *  renders the device's rotated footprint at half opacity, color-coded by
 *  whether placement at that cell would succeed.
 *
 *  Per REQUIREMENT.md §5.1 F3 the ghost is mandatory and must paint within
 *  16ms — Konva re-renders only when props change, and there's exactly one
 *  Group in the scene per ghost.
 */
import { Group, Rect } from 'react-konva';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { Cell, Rotation } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  device: Device;
  cell: Cell;
  rotation: Rotation;
  /** 'valid' = placement would succeed; 'collision' = device-on-device or
   *  out-of-plot; 'warn' = currently unused, reserved for B8 DRC warnings. */
  status: 'valid' | 'collision' | 'warn';
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

export function GhostPreview({ device, cell, rotation, status }: Props) {
  const bbox = rotatedBoundingBox(device, rotation);
  return (
    <Group x={cell.x * CELL_PX} y={cell.y * CELL_PX} listening={false}>
      <Rect
        width={bbox.width * CELL_PX}
        height={bbox.height * CELL_PX}
        fill={STATUS_FILL[status]}
        stroke={STATUS_STROKE[status]}
        strokeWidth={2}
        dash={[6, 4]}
      />
    </Group>
  );
}
