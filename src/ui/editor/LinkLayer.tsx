/** Render every Link (solid + fluid) as a polyline running through cell centers.
 *  Colors match the layer accent: amber = solid, teal = fluid.
 *  Slightly dimmed when ViewMode is the other layer (per design ref —
 *  always-visible cross-layer routing keeps spatial context).
 */
import { Line } from 'react-konva';
import type { Cell, Project } from '@core/domain/types.ts';
import type { ViewMode } from './use-view-mode.ts';
import { CELL_PX } from './use-camera.ts';

interface Props {
  project: Project;
  viewMode: ViewMode;
}

export function LinkLayer({ project, viewMode }: Props) {
  return (
    <>
      {project.solid_links.map((link) => (
        <LinkPolyline
          key={link.id}
          path={link.path}
          stroke="#ff9a3d"
          dimmed={viewMode === 'fluid'}
        />
      ))}
      {project.fluid_links.map((link) => (
        <LinkPolyline
          key={link.id}
          path={link.path}
          stroke="#4ec9d3"
          dimmed={viewMode === 'solid'}
        />
      ))}
    </>
  );
}

function LinkPolyline({
  path,
  stroke,
  dimmed,
}: {
  path: readonly Cell[];
  stroke: string;
  dimmed: boolean;
}) {
  if (path.length === 0) return null;
  // Convert cell centers to pixel coords flattened for Konva.Line.
  const points: number[] = [];
  for (const c of path) {
    points.push((c.x + 0.5) * CELL_PX, (c.y + 0.5) * CELL_PX);
  }
  return (
    <Line
      points={points}
      stroke={stroke}
      strokeWidth={3}
      lineCap="round"
      lineJoin="round"
      opacity={dimmed ? 0.35 : 0.95}
      listening={false}
    />
  );
}
