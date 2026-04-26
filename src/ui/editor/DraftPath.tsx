/** In-progress belt/pipe path overlay.
 *
 *  Renders the multi-segment draft as a dashed status-colored polyline +
 *  small square endpoint markers at every committed waypoint (so owners can
 *  see exactly where they've already clicked vs where the cursor is). Adds
 *  periodic chevron arrows in the flow direction so direction is unambiguous
 *  even mid-draft.
 *
 *  Status color comes from the same valid/collision/warn vocabulary the
 *  GhostPreview uses.
 */
import { Group, Line, Rect } from 'react-konva';
import type { Cell } from '@core/domain/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  path: readonly Cell[];
  /** Cells the user has explicitly clicked (excluding the live cursor).
   *  Each gets a small endpoint marker so the route is editable visually. */
  waypoints?: readonly Cell[];
  status: 'valid' | 'collision' | 'warn';
  /** Cells where commit will auto-place a cross-bridge (P4 v5). Drawn as a
   *  small ⊕ badge so the owner sees what's about to land. */
  autoBridges?: readonly Cell[];
}

const STATUS_STROKE: Record<Props['status'], string> = {
  valid: '#6dc26d',
  collision: '#e85d4a',
  warn: '#f0b73a',
};
const ARROW_SPACING = 3;
const ARROW_LEN = CELL_PX * 0.25;

export function DraftPath({ path, waypoints, status, autoBridges }: Props) {
  if (path.length === 0) return null;
  const stroke = STATUS_STROKE[status];

  const points: number[] = [];
  for (const c of path) {
    points.push((c.x + 0.5) * CELL_PX, (c.y + 0.5) * CELL_PX);
  }

  const arrows: number[][] = [];
  for (let i = 1; i < path.length; i++) {
    if (i % ARROW_SPACING !== 0) continue;
    const cell = path[i]!;
    const prev = path[i - 1]!;
    const dx = cell.x - prev.x;
    const dy = cell.y - prev.y;
    if (dx === 0 && dy === 0) continue;
    const cx = (cell.x + 0.5) * CELL_PX;
    const cy = (cell.y + 0.5) * CELL_PX;
    const baseX = cx - dx * ARROW_LEN;
    const baseY = cy - dy * ARROW_LEN;
    const px = -dy * ARROW_LEN * 0.7;
    const py = dx * ARROW_LEN * 0.7;
    arrows.push([baseX + px, baseY + py, cx, cy, baseX - px, baseY - py]);
  }

  const markers = waypoints ?? [path[0]!, path[path.length - 1]!];

  return (
    <Group listening={false}>
      <Line
        points={points}
        stroke={stroke}
        strokeWidth={3}
        opacity={0.65}
        dash={[6, 4]}
        lineCap="round"
        lineJoin="round"
      />
      {arrows.map((pts, i) => (
        <Line
          key={`arrow-${i.toString()}`}
          points={pts}
          stroke={stroke}
          strokeWidth={1.5}
          opacity={0.85}
        />
      ))}
      {markers.map((cell, i) => (
        <Rect
          key={`wp-${i.toString()}`}
          x={(cell.x + 0.5) * CELL_PX - 4}
          y={(cell.y + 0.5) * CELL_PX - 4}
          width={8}
          height={8}
          stroke={stroke}
          strokeWidth={1.5}
        />
      ))}
      {autoBridges?.map((cell, i) => (
        <BridgeBadge key={`br-${i.toString()}`} cell={cell} />
      ))}
    </Group>
  );
}

/** Visual hint at a cell where commit will auto-place a cross-bridge:
 *  a small dashed amber square + ⊕ glyph. */
function BridgeBadge({ cell }: { cell: Cell }) {
  const cx = (cell.x + 0.5) * CELL_PX;
  const cy = (cell.y + 0.5) * CELL_PX;
  const size = CELL_PX * 0.55;
  return (
    <Group listening={false}>
      <Rect
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        stroke="#ff9a3d"
        strokeWidth={1.2}
        dash={[3, 2]}
        opacity={0.95}
      />
      <Line points={[cx - size / 4, cy, cx + size / 4, cy]} stroke="#ff9a3d" strokeWidth={1.2} />
      <Line points={[cx, cy - size / 4, cx, cy + size / 4]} stroke="#ff9a3d" strokeWidth={1.2} />
    </Group>
  );
}
