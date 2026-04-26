/** Render every Link (solid + fluid) as a directional belt/pipe.
 *
 *  Visual: a wide translucent body fill + two thin parallel edge lines +
 *  periodic V-shaped chevron arrows pointing along the flow direction.
 *  The flow direction is taken from src→dst when both PortRefs are set;
 *  otherwise it's path[0]→path[N-1] (drawing order).
 *
 *  Solid links use amber, fluid links use teal. Dimmed (opacity 0.35) when
 *  the layer toggle is on the opposite layer to keep cross-layer context
 *  visible without competing for attention.
 */
import { Group, Line } from 'react-konva';
import type { Cell, Link, Project } from '@core/domain/types.ts';
import type { ViewMode } from './use-view-mode.ts';
import { CELL_PX } from './use-camera.ts';

const SOLID_COLOR = '#ff9a3d';
const FLUID_COLOR = '#4ec9d3';
const EDGE_OFFSET = CELL_PX * 0.3;
const ARROW_SPACING = 3; // cells between chevrons
const ARROW_LEN = CELL_PX * 0.28;

interface Props {
  project: Project;
  viewMode: ViewMode;
}

export function LinkLayer({ project, viewMode }: Props) {
  return (
    <>
      {project.solid_links.map((link) => (
        <LinkRender key={link.id} link={link} color={SOLID_COLOR} dimmed={viewMode === 'fluid'} />
      ))}
      {project.fluid_links.map((link) => (
        <LinkRender key={link.id} link={link} color={FLUID_COLOR} dimmed={viewMode === 'solid'} />
      ))}
    </>
  );
}

interface LinkRenderProps {
  link: Link;
  color: string;
  dimmed: boolean;
}

function LinkRender({ link, color, dimmed }: LinkRenderProps) {
  const path = link.path;
  if (path.length === 0) return null;
  // Direction-aware reversal: render path so the chevrons point src→dst.
  // (The src/dst hint matters once B12 commit-on-port-hit is wired; until
  // every link has src/dst set, we fall back to drawing-order direction.)
  const oriented = path; // src defaults to path[0] today; revisit if we
  // start populating both ends.
  const opacity = dimmed ? 0.35 : 1;

  // Single-cell links degenerate to a small dot; just draw the body filler.
  if (oriented.length === 1) {
    const c = oriented[0]!;
    return (
      <Line
        listening={false}
        points={[(c.x + 0.5) * CELL_PX, (c.y + 0.5) * CELL_PX]}
        stroke={color}
        strokeWidth={CELL_PX * 0.5}
        lineCap="round"
        opacity={opacity * 0.5}
      />
    );
  }

  const centerline = flatten(centerCoords(oriented));
  const [leftEdge, rightEdge] = parallelEdges(oriented);
  const arrows = chevrons(oriented);

  return (
    <Group listening={false} opacity={opacity}>
      <Line
        points={centerline}
        stroke={color}
        strokeWidth={CELL_PX * 0.6}
        opacity={0.18}
        lineCap="butt"
        lineJoin="miter"
      />
      <Line
        points={flatten(leftEdge)}
        stroke={color}
        strokeWidth={1.5}
        opacity={0.9}
        lineCap="round"
        lineJoin="round"
      />
      <Line
        points={flatten(rightEdge)}
        stroke={color}
        strokeWidth={1.5}
        opacity={0.9}
        lineCap="round"
        lineJoin="round"
      />
      {arrows.map((pts, i) => (
        <Line
          key={i.toString()}
          points={pts}
          stroke={color}
          strokeWidth={1.5}
          opacity={0.95}
          lineCap="round"
          lineJoin="round"
        />
      ))}
    </Group>
  );
}

function centerCoords(path: readonly Cell[]): { x: number; y: number }[] {
  return path.map((c) => ({ x: (c.x + 0.5) * CELL_PX, y: (c.y + 0.5) * CELL_PX }));
}

function flatten(pts: readonly { x: number; y: number }[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

/** Two parallel polylines offset perpendicular to the local flow direction.
 *  At a corner cell, the perpendicular bisects the incoming and outgoing
 *  segments — which gives a clean L join visually. */
function parallelEdges(
  path: readonly Cell[],
): [{ x: number; y: number }[], { x: number; y: number }[]] {
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    const { dx, dy } = tangentAt(path, i);
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular = rotate (dx,dy) by 90° CCW = (-dy, dx).
    const px = -dy / len;
    const py = dx / len;
    const cx = (cell.x + 0.5) * CELL_PX;
    const cy = (cell.y + 0.5) * CELL_PX;
    left.push({ x: cx - px * EDGE_OFFSET, y: cy - py * EDGE_OFFSET });
    right.push({ x: cx + px * EDGE_OFFSET, y: cy + py * EDGE_OFFSET });
  }
  return [left, right];
}

/** Tangent (dx, dy) at path index `i`. For interior cells we average the
 *  incoming and outgoing segment vectors so corners get a 45° perpendicular,
 *  giving clean L-joints in `parallelEdges`. */
function tangentAt(path: readonly Cell[], i: number): { dx: number; dy: number } {
  const cell = path[i]!;
  if (i === 0) {
    const next = path[1]!;
    return { dx: next.x - cell.x, dy: next.y - cell.y };
  }
  if (i === path.length - 1) {
    const prev = path[i - 1]!;
    return { dx: cell.x - prev.x, dy: cell.y - prev.y };
  }
  const prev = path[i - 1]!;
  const next = path[i + 1]!;
  return { dx: cell.x - prev.x + (next.x - cell.x), dy: cell.y - prev.y + (next.y - cell.y) };
}

/** A list of chevron polylines (V-shapes) pointing along the flow direction.
 *  One chevron every ARROW_SPACING cells; tip lands at the cell center. */
function chevrons(path: readonly Cell[]): number[][] {
  const arrows: number[][] = [];
  for (let i = 1; i < path.length; i++) {
    if (i % ARROW_SPACING !== 0) continue;
    const cell = path[i]!;
    const prev = path[i - 1]!;
    const dx = cell.x - prev.x;
    const dy = cell.y - prev.y;
    const cx = (cell.x + 0.5) * CELL_PX;
    const cy = (cell.y + 0.5) * CELL_PX;
    // Wing endpoints: step back from the tip by ARROW_LEN, then offset
    // perpendicular by ±ARROW_LEN * 0.7 so the V opens facing flow direction.
    const tipX = cx;
    const tipY = cy;
    const baseX = cx - dx * ARROW_LEN;
    const baseY = cy - dy * ARROW_LEN;
    const px = -dy * ARROW_LEN * 0.7;
    const py = dx * ARROW_LEN * 0.7;
    arrows.push([baseX + px, baseY + py, tipX, tipY, baseX - px, baseY - py]);
  }
  return arrows;
}
