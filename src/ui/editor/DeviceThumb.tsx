/** P4 v7 library card thumbnail. Renders the device's actual footprint
 *  rectangle + port direction triangles in a small SVG, mirroring the
 *  canvas's DeviceShape style so library cards visually match what the
 *  user gets on the editor.
 *
 *  SVG (not Konva) so the component renders cleanly in jsdom test envs
 *  without pulling in the canvas npm dependency.
 *
 *  P4 v7.6: also renders the same 3-char zh-Hans abbreviation as the
 *  on-canvas label (see `device-label.ts`), so library previews match
 *  the placed device.
 */
import { portsInWorldFrame } from '@core/domain/geometry.ts';
import type { Device, PortKind } from '@core/data-loader/types.ts';
import { abbreviateCnName } from './device-label.ts';

const THUMB_PX = 80;
const INSET = 6;
// P4 v7.6: thumbs share a fixed 6×6 reference grid so a 1×1 device renders
// SMALL and an 8×8 device renders LARGE. Devices with max(w, h) ≤ 6 keep
// the baseline cell size; bigger ones shrink so the long edge fills the
// available space exactly. Owners can now eyeball relative footprints from
// the library card grid.
const BASELINE_CELLS = 6;

const PORT_KIND_COLOR: Record<PortKind, string> = {
  solid: '#ff9a3d',
  fluid: '#4ec9d3',
  power: '#f0b73a',
};

interface Props {
  device: Device;
}

export function DeviceThumb({ device }: Props) {
  const { width: w, height: h } = device.footprint;
  const cellPx = (THUMB_PX - INSET * 2) / Math.max(BASELINE_CELLS, w, h);
  const fpW = w * cellPx;
  const fpH = h * cellPx;
  const offX = (THUMB_PX - fpW) / 2;
  const offY = (THUMB_PX - fpH) / 2;
  const accent = device.has_fluid_interface ? '#4ec9d3' : '#ff9a3d';
  const ports = portsInWorldFrame(device, { position: { x: 0, y: 0 }, rotation: 0 });
  // P4 v7.6: 3-char CN abbreviation centered inside the footprint, mirroring
  // the canvas DeviceLayer label. Font size scales with the smaller footprint
  // dimension; below ~10px we drop the label entirely to avoid noise on tiny
  // 1×1 thumbs.
  const label = abbreviateCnName(device.display_name_zh_hans);
  const labelFontSize = Math.min(fpW / 4, fpH / 2);
  const showLabel = labelFontSize >= 8;

  return (
    <svg
      width={THUMB_PX}
      height={THUMB_PX}
      viewBox={`0 0 ${THUMB_PX.toString()} ${THUMB_PX.toString()}`}
      aria-hidden
    >
      <g transform={`translate(${offX.toString()}, ${offY.toString()})`}>
        <rect width={fpW} height={fpH} fill="#181d23" stroke={accent} strokeWidth={1} />
        {showLabel && (
          <text
            x={fpW / 2}
            y={fpH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"
            fontSize={labelFontSize}
            fontWeight="bold"
            fill={accent}
          >
            {label}
          </text>
        )}
        {ports.map((p, i) => (
          <PortGlyph
            key={i.toString()}
            cellPx={cellPx}
            cellX={p.cell.x}
            cellY={p.cell.y}
            dx={p.face_direction.dx}
            dy={p.face_direction.dy}
            kind={p.kind}
            constraint={p.direction_constraint}
          />
        ))}
      </g>
    </svg>
  );
}

function PortGlyph({
  cellPx,
  cellX,
  cellY,
  dx,
  dy,
  kind,
  constraint,
}: {
  cellPx: number;
  cellX: number;
  cellY: number;
  dx: number;
  dy: number;
  kind: PortKind;
  constraint: 'input' | 'output' | 'bidirectional' | 'paired_opposite';
}) {
  const color = PORT_KIND_COLOR[kind];
  const rx = cellX * cellPx;
  const ry = cellY * cellPx;
  const faceMidX = rx + cellPx / 2 + (dx * cellPx) / 2;
  const faceMidY = ry + cellPx / 2 + (dy * cellPx) / 2;

  if (constraint === 'bidirectional' || constraint === 'paired_opposite') {
    const box = cellPx * 0.32;
    return (
      <rect
        x={faceMidX - box / 2}
        y={faceMidY - box / 2}
        width={box}
        height={box}
        stroke={color}
        strokeWidth={1}
        fill="rgba(0,0,0,0.3)"
      />
    );
  }
  // Same flat-arrow geometry as DeviceLayer's PortMarker (P4 v7 dims).
  const triLen = cellPx * 0.32;
  const triWing = cellPx * 0.46;
  const sign = constraint === 'output' ? 1 : -1;
  const tipX = faceMidX + sign * dx * triLen;
  const tipY = faceMidY + sign * dy * triLen;
  const perpX = -dy;
  const perpY = dx;
  const aX = faceMidX + perpX * triWing;
  const aY = faceMidY + perpY * triWing;
  const bX = faceMidX - perpX * triWing;
  const bY = faceMidY - perpY * triWing;
  return (
    <polygon
      points={`${tipX.toString()},${tipY.toString()} ${aX.toString()},${aY.toString()} ${bX.toString()},${bY.toString()}`}
      fill={color}
      stroke={color}
      strokeWidth={0.5}
    />
  );
}
