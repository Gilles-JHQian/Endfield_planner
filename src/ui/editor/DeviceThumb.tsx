/** P4 v7 library card thumbnail. Renders the device's actual footprint
 *  rectangle + port direction triangles in a small SVG, mirroring the
 *  canvas's DeviceShape style so library cards visually match what the
 *  user gets on the editor.
 *
 *  SVG (not Konva) so the component renders cleanly in jsdom test envs
 *  without pulling in the canvas npm dependency.
 */
import { portsInWorldFrame } from '@core/domain/geometry.ts';
import type { Device, PortKind } from '@core/data-loader/types.ts';

const THUMB_PX = 80;
const INSET = 6;

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
  const cellPx = Math.max(6, Math.floor((THUMB_PX - INSET * 2) / Math.max(w, h)));
  const fpW = w * cellPx;
  const fpH = h * cellPx;
  const offX = (THUMB_PX - fpW) / 2;
  const offY = (THUMB_PX - fpH) / 2;
  const accent = device.has_fluid_interface ? '#4ec9d3' : '#ff9a3d';
  const ports = portsInWorldFrame(device, { position: { x: 0, y: 0 }, rotation: 0 });

  return (
    <svg
      width={THUMB_PX}
      height={THUMB_PX}
      viewBox={`0 0 ${THUMB_PX.toString()} ${THUMB_PX.toString()}`}
      aria-hidden
    >
      <g transform={`translate(${offX.toString()}, ${offY.toString()})`}>
        <rect width={fpW} height={fpH} fill="#181d23" stroke={accent} strokeWidth={1} />
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
