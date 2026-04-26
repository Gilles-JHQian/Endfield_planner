/** Konva overlay that flashes a colored rectangle on each cell in `cells`.
 *  Sits on the overlay layer (listening=false) so it doesn't intercept clicks.
 *  EditorPage clears `cells` after a short timeout, fading the highlight.
 */
import { Group, Rect } from 'react-konva';
import type { Cell } from '@core/domain/types.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  cells: readonly Cell[];
  severity: 'error' | 'warning' | 'info';
}

const STROKE: Record<Props['severity'], string> = {
  error: '#e85d4a',
  warning: '#f0b73a',
  info: '#4ec9d3',
};

export function IssueHighlight({ cells, severity }: Props) {
  if (cells.length === 0) return null;
  const color = STROKE[severity];
  return (
    <Group listening={false}>
      {cells.map((c, i) => (
        <Rect
          key={`${i.toString()}-${c.x.toString()},${c.y.toString()}`}
          x={c.x * CELL_PX}
          y={c.y * CELL_PX}
          width={CELL_PX}
          height={CELL_PX}
          stroke={color}
          strokeWidth={2}
          dash={[4, 3]}
          opacity={0.9}
        />
      ))}
    </Group>
  );
}
