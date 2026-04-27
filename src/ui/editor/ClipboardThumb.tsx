/** P4 v7.7 library thumbnail for a clipboard slot — renders the relative
 *  device footprints + link paths so owners can distinguish slots at a
 *  glance. Same 6×6 baseline scaling rule as `DeviceThumb` so a 1×1 paste
 *  reads small and a 6×6 cluster fills the thumb.
 *
 *  No text overlays (P4 v7.7 visual rule); colors mirror DeviceThumb /
 *  DeviceLayer (amber for solid devices/links, teal for fluid).
 */
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { Device } from '@core/data-loader/types.ts';
import type { ClipboardPayload } from '@core/persistence/index.ts';

const THUMB_PX = 80;
const INSET = 6;
const BASELINE_CELLS = 6;

const SOLID_COLOR = '#ff9a3d';
const FLUID_COLOR = '#4ec9d3';

interface Props {
  payload: ClipboardPayload;
  /** Catalog lookup for footprint + has_fluid_interface. Items whose
   *  `device_id` doesn't resolve are skipped (defensive — should not
   *  happen with a correctly-built payload). */
  lookup: (device_id: string) => Device | undefined;
}

export function ClipboardThumb({ payload, lookup }: Props) {
  // Compute the bounding box: max of (item rel_position + rotated footprint)
  // and (link rel_path cell + 1).
  let bboxW = 0;
  let bboxH = 0;
  for (const it of payload.items) {
    const dev = lookup(it.device_id);
    if (!dev) continue;
    const bbox = rotatedBoundingBox(dev, it.rotation);
    bboxW = Math.max(bboxW, it.rel_position.x + bbox.width);
    bboxH = Math.max(bboxH, it.rel_position.y + bbox.height);
  }
  for (const l of payload.links) {
    for (const c of l.rel_path) {
      bboxW = Math.max(bboxW, c.x + 1);
      bboxH = Math.max(bboxH, c.y + 1);
    }
  }
  // Empty payload (shouldn't occur in practice) — fall back to a single cell.
  if (bboxW === 0 || bboxH === 0) {
    bboxW = 1;
    bboxH = 1;
  }

  const cellPx = (THUMB_PX - INSET * 2) / Math.max(BASELINE_CELLS, bboxW, bboxH);
  const fpW = bboxW * cellPx;
  const fpH = bboxH * cellPx;
  const offX = (THUMB_PX - fpW) / 2;
  const offY = (THUMB_PX - fpH) / 2;

  return (
    <svg
      width={THUMB_PX}
      height={THUMB_PX}
      viewBox={`0 0 ${THUMB_PX.toString()} ${THUMB_PX.toString()}`}
      aria-hidden
    >
      <g transform={`translate(${offX.toString()}, ${offY.toString()})`}>
        {/* Link paths first so device rects render on top. */}
        {payload.links.map((l, i) => {
          const color = l.layer === 'solid' ? SOLID_COLOR : FLUID_COLOR;
          const points = l.rel_path
            .map((c) => {
              const cx = (c.x + 0.5) * cellPx;
              const cy = (c.y + 0.5) * cellPx;
              return `${cx.toString()},${cy.toString()}`;
            })
            .join(' ');
          return (
            <polyline
              key={`l${i.toString()}`}
              points={points}
              stroke={color}
              strokeWidth={Math.max(1, cellPx * 0.25)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.7}
            />
          );
        })}
        {payload.items.map((it, i) => {
          const dev = lookup(it.device_id);
          if (!dev) return null;
          const bbox = rotatedBoundingBox(dev, it.rotation);
          const accent = dev.has_fluid_interface ? FLUID_COLOR : SOLID_COLOR;
          return (
            <rect
              key={`i${i.toString()}`}
              x={it.rel_position.x * cellPx}
              y={it.rel_position.y * cellPx}
              width={bbox.width * cellPx}
              height={bbox.height * cellPx}
              fill="#181d23"
              stroke={accent}
              strokeWidth={1}
            />
          );
        })}
      </g>
    </svg>
  );
}
