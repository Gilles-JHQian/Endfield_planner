/** In-progress belt/pipe path overlay — drawn after the user clicks the
 *  first anchor cell, follows the cursor until the second click commits the
 *  link. Color-coded the same as the placement ghost: green=valid, red=
 *  collision, yellow=warning.
 */
import { Group, Line, Rect } from 'react-konva';
import type { Cell, Layer } from '@core/domain/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  path: readonly Cell[];
  layer: Layer;
  status: 'valid' | 'collision' | 'warn';
}

const STATUS_STROKE: Record<Props['status'], string> = {
  valid: '#6dc26d',
  collision: '#e85d4a',
  warn: '#f0b73a',
};

export function DraftPath({ path, layer, status }: Props) {
  if (path.length === 0) return null;
  const points: number[] = [];
  for (const c of path) {
    points.push((c.x + 0.5) * CELL_PX, (c.y + 0.5) * CELL_PX);
  }
  const stroke = STATUS_STROKE[status];

  return (
    <Group listening={false}>
      <Line
        points={points}
        stroke={stroke}
        strokeWidth={3}
        opacity={0.6}
        dash={[6, 4]}
        lineCap="round"
        lineJoin="round"
      />
      {/* Anchor markers at endpoints. */}
      <Endpoint cell={path[0]!} stroke={stroke} layer={layer} />
      {path.length > 1 && <Endpoint cell={path[path.length - 1]!} stroke={stroke} layer={layer} />}
    </Group>
  );
}

function Endpoint({ cell, stroke, layer }: { cell: Cell; stroke: string; layer: Layer }) {
  const x = (cell.x + 0.5) * CELL_PX - 4;
  const y = (cell.y + 0.5) * CELL_PX - 4;
  void layer;
  return <Rect x={x} y={y} width={8} height={8} stroke={stroke} strokeWidth={1.5} />;
}
