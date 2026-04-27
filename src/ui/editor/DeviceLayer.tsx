/** Renders every PlacedDevice as a Konva Group inside the canvas content
 *  layer. Footprint outline + truncated CN display name + recipe-bound
 *  amber dot in the corner.
 *
 *  Color follows the device's "primary layer":
 *  - has_fluid_interface → teal accent
 *  - otherwise → amber accent
 *
 *  P4 v7.6: the on-device label switched from the device-id's first letter
 *  to the first 3 characters of `display_name_zh_hans` (with `…` when the
 *  full name is longer). See `device-label.ts`.
 */
import { Group, Line, Rect, Text } from 'react-konva';
import { footprintCells, portsInWorldFrame, rotatedBoundingBox } from '@core/domain/geometry.ts';
import type { PlacedDevice } from '@core/domain/types.ts';
import type { Device, PortKind } from '@core/data-loader/types.ts';
import type { WorldPort } from '@core/domain/geometry.ts';
import { CELL_PX } from './use-camera.ts';
import { abbreviateCnName } from './device-label.ts';

const PORT_KIND_COLOR: Record<PortKind, string> = {
  solid: '#ff9a3d',
  fluid: '#4ec9d3',
  power: '#f0b73a',
};
// P4 v7: even flatter — wings widened, length shortened further. Triangle
// reads as a wide arrow / chevron rather than a tall spike.
const TRIANGLE_LEN = CELL_PX * 0.18;
const TRIANGLE_WING = CELL_PX * 0.26;
const BIDIR_BOX = CELL_PX * 0.18;

interface Props {
  devices: readonly PlacedDevice[];
  lookup: (device_id: string) => Device | undefined;
  selectedInstanceId?: string | null;
  /** Instance ids in the box-select multi-selection. Rendered with a blue
   *  bracket variant so they don't conflict with the amber single-select. */
  boxSelectedIds?: ReadonlySet<string>;
  /** Instance ids of devices currently inside some 供电桩 AoE. Devices that
   *  require power but aren't in this set get a red "unplugged" badge. */
  coveredInstanceIds?: ReadonlySet<string>;
  /** P4 v7.7: current camera zoom (1 = 100%). Drives screen-fixed label
   *  sizing and width-aware truncation. Defaults to 1 if unspecified for
   *  backward compatibility with tests that don't plumb the camera. */
  zoom?: number;
}

export function DeviceLayer({
  devices,
  lookup,
  selectedInstanceId,
  boxSelectedIds,
  coveredInstanceIds,
  zoom = 1,
}: Props) {
  return (
    <>
      {devices.map((placed) => {
        const dev = lookup(placed.device_id);
        if (!dev) return null;
        const unpowered =
          dev.requires_power &&
          dev.power_aoe?.purpose !== 'device_supply' &&
          coveredInstanceIds !== undefined &&
          !coveredInstanceIds.has(placed.instance_id);
        return (
          <DeviceShape
            key={placed.instance_id}
            placed={placed}
            device={dev}
            selected={placed.instance_id === selectedInstanceId}
            boxSelected={boxSelectedIds?.has(placed.instance_id) ?? false}
            unpowered={unpowered}
            zoom={zoom}
          />
        );
      })}
    </>
  );
}

// P4 v7.7: device-name labels render at a fixed screen pixel height
// regardless of zoom; the truncation rule expands the abbreviation to
// fill whatever screen width the device occupies.
const SCREEN_LABEL_PX = 12;
// CJK glyphs are roughly square; reserve 1.05 × font for safety so a 3-char
// label fits a square that's `3 * SCREEN_LABEL_PX * 1.05` wide.
const SCREEN_LABEL_GLYPH_RATIO = 1.05;
// Don't render a label inside footprints narrower than this (in screen px) —
// even a single CJK glyph would be unreadable.
const SCREEN_LABEL_MIN_WIDTH_PX = 12;
// Categories whose devices have iconic enough geometry to skip the label
// (bridges read as cross / Y / arrow shapes; storage I/O ports are tiny
// "load" / "unload" badges where text adds noise).
const LABEL_SKIP_CATEGORIES: ReadonlySet<string> = new Set(['logistics', 'storage']);

function DeviceShape({
  placed,
  device,
  selected,
  boxSelected,
  unpowered,
  zoom,
}: {
  placed: PlacedDevice;
  device: Device;
  selected: boolean;
  boxSelected: boolean;
  unpowered: boolean;
  zoom: number;
}) {
  const bbox = rotatedBoundingBox(device, placed.rotation);
  const x = placed.position.x * CELL_PX;
  const y = placed.position.y * CELL_PX;
  const w = bbox.width * CELL_PX;
  const h = bbox.height * CELL_PX;
  const isFluid = device.has_fluid_interface;
  const accent = isFluid ? '#4ec9d3' : '#ff9a3d';
  // P4 v7.7: label is a screen-fixed-size string truncated to fit the
  // device's screen footprint. fontSize is divided by `zoom` so Konva's
  // stage-level scale cancels out → constant on-screen height.
  const screenWidth = w * zoom;
  const showLabel =
    !LABEL_SKIP_CATEGORIES.has(device.category) && screenWidth >= SCREEN_LABEL_MIN_WIDTH_PX;
  const maxChars = Math.floor(screenWidth / (SCREEN_LABEL_PX * SCREEN_LABEL_GLYPH_RATIO));
  const labelText =
    showLabel && maxChars >= 1 ? abbreviateCnName(device.display_name_zh_hans, maxChars) : '';
  const fontSize = SCREEN_LABEL_PX / zoom;

  return (
    <Group x={x} y={y}>
      {/* Body — semi-opaque surface-2 with hairline accent border. */}
      <Rect width={w} height={h} fill="#181d23" stroke={accent} strokeWidth={1} opacity={0.95} />
      {/* Display-name label — truncated CN name centered inside the footprint.
       *  P4 v7.7: fontSize / zoom keeps text at SCREEN_LABEL_PX on screen. */}
      {labelText && (
        <Text
          x={0}
          y={0}
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          text={labelText}
          fontFamily="Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"
          fontSize={fontSize}
          fontStyle="bold"
          fill={accent}
          listening={false}
        />
      )}
      {/* Recipe-bound badge — small amber dot in top-right corner. */}
      {placed.recipe_id !== null && (
        <Rect x={w - 6} y={2} width={4} height={4} fill="#ff9a3d" listening={false} />
      )}
      {/* Per-port direction triangles — outward = output, inward = input,
       *  small box = bidirectional / paired_opposite. */}
      <PortMarkers placed={placed} device={device} />
      {/* Unpowered badge — red ⚡̸ in the bottom-right corner. */}
      {unpowered && <UnpoweredBadge w={w} h={h} />}
      {/* Selection brackets — 4 8px corner pieces.
       *  Single-select (yellow) takes precedence over box-select (blue) so
       *  the inspector's focused device stays distinguishable. */}
      {selected ? (
        <SelectionBrackets w={w} h={h} color="#ff9a3d" />
      ) : (
        boxSelected && <SelectionBrackets w={w} h={h} color="#4ec9d3" />
      )}
    </Group>
  );
}

/** Per-port direction triangle / box overlay. Exported so GhostPreview can
 *  reuse the same marker visuals for the device-placement ghost (P4 v7). */
export function PortMarkers({ placed, device }: { placed: PlacedDevice; device: Device }) {
  const ports = portsInWorldFrame(device, placed);
  if (ports.length === 0) return null;
  return (
    <Group listening={false}>
      {ports.map((p, i) => (
        <PortMarker key={i.toString()} placed={placed} port={p} />
      ))}
    </Group>
  );
}

function PortMarker({ placed, port }: { placed: PlacedDevice; port: WorldPort }) {
  // Group-relative position of the port cell's top-left corner.
  const rx = (port.cell.x - placed.position.x) * CELL_PX;
  const ry = (port.cell.y - placed.position.y) * CELL_PX;
  // Face midpoint (where the cell's outer edge meets the face).
  const faceMidX = rx + CELL_PX / 2 + (port.face_direction.dx * CELL_PX) / 2;
  const faceMidY = ry + CELL_PX / 2 + (port.face_direction.dy * CELL_PX) / 2;
  const color = PORT_KIND_COLOR[port.kind];

  if (
    port.direction_constraint === 'bidirectional' ||
    port.direction_constraint === 'paired_opposite'
  ) {
    return (
      <Rect
        x={faceMidX - BIDIR_BOX / 2}
        y={faceMidY - BIDIR_BOX / 2}
        width={BIDIR_BOX}
        height={BIDIR_BOX}
        stroke={color}
        strokeWidth={1.5}
        fill="rgba(0,0,0,0.3)"
        listening={false}
      />
    );
  }

  // Triangle direction: outward for output, inward for input.
  const outward = port.direction_constraint === 'output';
  const sign = outward ? 1 : -1;
  const tipX = faceMidX + sign * port.face_direction.dx * TRIANGLE_LEN;
  const tipY = faceMidY + sign * port.face_direction.dy * TRIANGLE_LEN;
  // Perpendicular to face_direction (rotate 90° CCW: (dx,dy) → (-dy,dx)).
  const perpX = -port.face_direction.dy;
  const perpY = port.face_direction.dx;
  const wingAX = faceMidX + perpX * TRIANGLE_WING;
  const wingAY = faceMidY + perpY * TRIANGLE_WING;
  const wingBX = faceMidX - perpX * TRIANGLE_WING;
  const wingBY = faceMidY - perpY * TRIANGLE_WING;
  return (
    <Line
      points={[tipX, tipY, wingAX, wingAY, wingBX, wingBY]}
      closed
      fill={color}
      stroke={color}
      strokeWidth={0.5}
      listening={false}
    />
  );
}

function UnpoweredBadge({ w, h }: { w: number; h: number }) {
  // 8×8 box at bottom-right with a diagonal slash through a lightning glyph.
  const size = 10;
  const bx = w - size - 2;
  const by = h - size - 2;
  return (
    <Group listening={false}>
      <Rect
        x={bx}
        y={by}
        width={size}
        height={size}
        fill="#1a0a0a"
        stroke="#e85d4a"
        strokeWidth={1}
      />
      <Text
        x={bx}
        y={by - 1}
        width={size}
        align="center"
        text="⚡"
        fontFamily="Rajdhani, sans-serif"
        fontSize={9}
        fill="#e85d4a"
        listening={false}
      />
    </Group>
  );
}

function SelectionBrackets({ w, h, color }: { w: number; h: number; color: string }) {
  const b = 8;
  const stroke = color;
  const sw = 2;
  return (
    <Group listening={false}>
      {/* TL */}
      <Rect x={-1} y={-1} width={b} height={sw} fill={stroke} />
      <Rect x={-1} y={-1} width={sw} height={b} fill={stroke} />
      {/* TR */}
      <Rect x={w - b + 1} y={-1} width={b} height={sw} fill={stroke} />
      <Rect x={w - 1} y={-1} width={sw} height={b} fill={stroke} />
      {/* BL */}
      <Rect x={-1} y={h - sw + 1} width={b} height={sw} fill={stroke} />
      <Rect x={-1} y={h - b + 1} width={sw} height={b} fill={stroke} />
      {/* BR */}
      <Rect x={w - b + 1} y={h - sw + 1} width={b} height={sw} fill={stroke} />
      <Rect x={w - 1} y={h - b + 1} width={sw} height={b} fill={stroke} />
    </Group>
  );
}

/** Returns the placed-device whose footprint covers `cell`, or null. */
export function findDeviceAtCell(
  devices: readonly PlacedDevice[],
  lookup: (id: string) => Device | undefined,
  cell: { x: number; y: number },
): PlacedDevice | null {
  for (const placed of devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const c of footprintCells(dev, placed)) {
      if (c.x === cell.x && c.y === cell.y) return placed;
    }
  }
  return null;
}
