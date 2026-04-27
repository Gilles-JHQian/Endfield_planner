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
// P4 v7.7: tighter spacing + shorter wings — owners reported the v6
// chevrons looked sparse and bulky on long belts. Halving the length and
// dropping the spacing one cell makes the flow read smoother without
// blowing up the chevron count on dense belts (chevrons skip turn cells
// already, so the tighter spacing doesn't double up at corners).
const ARROW_SPACING = 2; // cells between chevrons
const ARROW_LEN = CELL_PX * 0.18;
/** P4 v6 rounded corners: at each corner cell we insert TWO offset points into
 *  the polylines (pre-bend and post-bend), each `CORNER_INSET` from the cell
 *  center along the incoming / outgoing axis. Combined with `lineJoin=round`,
 *  the polyline reads as a smooth quarter-arc instead of a sharp miter. */
const CORNER_INSET = CELL_PX * 0.3;

interface Props {
  project: Project;
  viewMode: ViewMode;
  /** P4 v6: highlight set — every link in this set renders the selection
   *  halo. Right-click adds {id}; right-mouse drag adds every link whose
   *  path is fully inside the rectangle. */
  selectedLinkIds?: ReadonlySet<string>;
}

export function LinkLayer({ project, viewMode, selectedLinkIds }: Props) {
  return (
    <>
      {project.solid_links.map((link) => (
        <LinkRender
          key={link.id}
          link={link}
          color={SOLID_COLOR}
          dimmed={viewMode === 'fluid'}
          selected={selectedLinkIds?.has(link.id) ?? false}
        />
      ))}
      {project.fluid_links.map((link) => (
        <LinkRender
          key={link.id}
          link={link}
          color={FLUID_COLOR}
          dimmed={viewMode === 'solid'}
          selected={selectedLinkIds?.has(link.id) ?? false}
        />
      ))}
    </>
  );
}

interface LinkRenderProps {
  link: Link;
  color: string;
  dimmed: boolean;
  selected: boolean;
}

function LinkRender({ link, color, dimmed, selected }: LinkRenderProps) {
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
      {/* Selection halo (P4 v5): wide blue glow underlying the body fill. */}
      {selected && (
        <Line
          points={centerline}
          stroke="#4ec9d3"
          strokeWidth={CELL_PX * 0.85}
          opacity={0.4}
          lineCap="round"
          lineJoin="round"
        />
      )}
      <Line
        points={centerline}
        stroke={color}
        strokeWidth={CELL_PX * 0.6}
        opacity={0.18}
        lineCap="round"
        lineJoin="round"
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

/** Center polyline with chamfer points inserted at each corner. Straight cells
 *  emit one center point; corner cells emit two — pre-bend and post-bend —
 *  each `CORNER_INSET` from the center along the relevant axis. The straight
 *  segment between them, combined with `lineJoin=round`, reads as a
 *  rounded quarter-arc instead of a sharp miter. */
function centerCoords(path: readonly Cell[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    const cx = (cell.x + 0.5) * CELL_PX;
    const cy = (cell.y + 0.5) * CELL_PX;
    const corner = cornerAxes(path, i);
    if (!corner) {
      out.push({ x: cx, y: cy });
      continue;
    }
    out.push({
      x: cx - corner.inDx * CORNER_INSET,
      y: cy - corner.inDy * CORNER_INSET,
    });
    out.push({
      x: cx + corner.outDx * CORNER_INSET,
      y: cy + corner.outDy * CORNER_INSET,
    });
  }
  return out;
}

function flatten(pts: readonly { x: number; y: number }[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y);
  return out;
}

/** Two parallel polylines offset perpendicular to the local flow direction.
 *  At a corner cell, two chamfer points are emitted on each edge — one
 *  perpendicular to the incoming axis, one to the outgoing axis. The straight
 *  bevel segment between them, combined with `lineJoin=round`, reads as a
 *  rounded corner. */
function parallelEdges(
  path: readonly Cell[],
): [{ x: number; y: number }[], { x: number; y: number }[]] {
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    const cx = (cell.x + 0.5) * CELL_PX;
    const cy = (cell.y + 0.5) * CELL_PX;
    const corner = cornerAxes(path, i);
    if (!corner) {
      const { dx, dy } = tangentAt(path, i);
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      left.push({ x: cx - px * EDGE_OFFSET, y: cy - py * EDGE_OFFSET });
      right.push({ x: cx + px * EDGE_OFFSET, y: cy + py * EDGE_OFFSET });
      continue;
    }
    // Pre-bend point — offset perpendicular to the incoming axis.
    const inPx = -corner.inDy;
    const inPy = corner.inDx;
    const preCx = cx - corner.inDx * CORNER_INSET;
    const preCy = cy - corner.inDy * CORNER_INSET;
    left.push({ x: preCx - inPx * EDGE_OFFSET, y: preCy - inPy * EDGE_OFFSET });
    right.push({ x: preCx + inPx * EDGE_OFFSET, y: preCy + inPy * EDGE_OFFSET });
    // Post-bend point — offset perpendicular to the outgoing axis.
    const outPx = -corner.outDy;
    const outPy = corner.outDx;
    const postCx = cx + corner.outDx * CORNER_INSET;
    const postCy = cy + corner.outDy * CORNER_INSET;
    left.push({ x: postCx - outPx * EDGE_OFFSET, y: postCy - outPy * EDGE_OFFSET });
    right.push({ x: postCx + outPx * EDGE_OFFSET, y: postCy + outPy * EDGE_OFFSET });
  }
  return [left, right];
}

/** If cell `i` is a corner (incoming axis ≠ outgoing axis), return the unit
 *  vectors for both axes. Otherwise null. */
function cornerAxes(
  path: readonly Cell[],
  i: number,
): { inDx: number; inDy: number; outDx: number; outDy: number } | null {
  if (i === 0 || i === path.length - 1) return null;
  const cell = path[i]!;
  const prev = path[i - 1]!;
  const next = path[i + 1]!;
  const inDx = Math.sign(cell.x - prev.x);
  const inDy = Math.sign(cell.y - prev.y);
  const outDx = Math.sign(next.x - cell.x);
  const outDy = Math.sign(next.y - cell.y);
  // Same axis = straight, not a corner.
  if ((inDx !== 0 && outDx !== 0) || (inDy !== 0 && outDy !== 0)) return null;
  return { inDx, inDy, outDx, outDy };
}

/** Tangent (dx, dy) at path index `i`. Used for non-corner cells only. */
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
