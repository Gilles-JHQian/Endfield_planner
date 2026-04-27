/** P4 v7.3 — multi-device + multi-link cursor-following ghost rendered while
 *  the user is in move mode (or paste mode). Each device is drawn as a low-
 *  opacity rect with port markers (matching the placement ghost / DeviceLayer
 *  style). Cells in the colliding-set are tinted red so owners can see exactly
 *  which cells block the placement; otherwise the whole ghost reads green.
 *
 *  P4 v7.8: power-diffuser / repeater devices in the snapshot also render
 *  their candidate AoE as a dashed box so owners can see what supply zone
 *  the new placement would create — symmetric with the place-tool ghost.
 *  P4 v7.9: AoE preview ALSO highlights the existing-project devices that
 *  would fall inside the supply zone (white wash).
 *
 *  P4 v7.10: split the body subtree (device outlines + port markers + link
 *  path rects) from the per-cursor overlays (collision tints, AoE preview).
 *  The body renders at SNAPSHOT-relative positions inside an outer Group
 *  whose `(x, y)` translate the cluster to the current cursor. Body subtree
 *  is React.memo'd on `(bodyDevices, bodyLinks, lookup, collides)` and those
 *  references stay stable across cursor moves — so a 100-device move ghost
 *  no longer reconciles ~3000 Konva nodes per mouse cell change. Per-cursor
 *  cost is now ≈ updating the outer Group's `(x, y)` attrs + a tiny
 *  CollisionTints / AoePreview render.
 */
import { memo } from 'react';
import { Group, Rect } from 'react-konva';
import { rotatedBoundingBox } from '@core/domain/geometry.ts';
import { previewPoleLinkZone, previewSupplyZone } from '@core/domain/power-coverage.ts';
import type { Cell, Layer, PlacedDevice } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';
import { PortMarkers } from './DeviceLayer.tsx';
import { AoeBox, CoveredHighlight } from './GhostPreview.tsx';

interface MoveGhostShape {
  /** Body devices at SNAPSHOT-relative positions (rotation applied, NO
   *  translation). Reference is stable across cursor moves — only changes
   *  on moveMode entry, R press, or pasteSource change. The outer Group's
   *  `transform` is what moves the body to the cursor. */
  bodyDevices: readonly PlacedDevice[];
  bodyLinks: readonly { layer: Layer; tier_id: string; path: readonly Cell[] }[];
  /** Pixel translation that maps body-coord cells to the current cursor's
   *  cluster position. Updates per cursor move; applied via the outer Group's
   *  `(x, y)` attrs so the body subtree itself doesn't re-render. */
  transform: { x: number; y: number };
  /** Post-translation device positions. Used by `AoePreview` to anchor the
   *  AoE box at the new world location. `bodyDevices` ⊕ translation. */
  devices: readonly PlacedDevice[];
  /** True when at least one ghost cell collides. Drives the red outline +
   *  fill for every body device. */
  collides: boolean;
  /** "x,y" world-coord keys for cells the ghost wants to occupy that are
   *  blocked. The renderer overlays these in red OUTSIDE the transform Group
   *  (already in world coords). */
  collidingCells: Set<string>;
}

interface Props {
  ghost: MoveGhostShape;
  lookup: (id: string) => Device | undefined;
  /** P4 v7.9: live project devices used to compute the white wash on the
   *  AoE preview's covered devices. Only consulted when at least one ghost
   *  device has `power_aoe.purpose === 'device_supply'`. */
  existingDevices?: readonly PlacedDevice[];
}

const VALID_FILL = 'rgba(109, 194, 109, 0.18)';
const COLLISION_FILL = 'rgba(232, 93, 74, 0.28)';
const VALID_STROKE = '#6dc26d';
const COLLISION_STROKE = '#e85d4a';
const SOLID_LINK = '#ff9a3d';
const FLUID_LINK = '#4ec9d3';

export const MoveModeGhost = memo(function MoveModeGhost({
  ghost,
  lookup,
  existingDevices,
}: Props) {
  return (
    <Group listening={false} opacity={0.85}>
      <AoePreview ghostDevices={ghost.devices} lookup={lookup} existingDevices={existingDevices} />
      <CollisionTints cells={ghost.collidingCells} />
      <Group x={ghost.transform.x} y={ghost.transform.y}>
        <GhostBody
          devices={ghost.bodyDevices}
          links={ghost.bodyLinks}
          lookup={lookup}
          collides={ghost.collides}
        />
      </Group>
    </Group>
  );
});

/** P4 v7.10: the static body. Renders device outlines + port markers + link
 *  path rects at body-coord positions. Memoized on `(devices, links, lookup,
 *  collides)` so cursor moves with stable references skip re-render entirely.
 *  `collides` only flips when the ghost transitions in/out of a colliding
 *  state — rare during smooth drag — so memo cache hits dominate. */
const GhostBody = memo(function GhostBody({
  devices,
  links,
  lookup,
  collides,
}: {
  devices: readonly PlacedDevice[];
  links: readonly { layer: Layer; tier_id: string; path: readonly Cell[] }[];
  lookup: (id: string) => Device | undefined;
  collides: boolean;
}) {
  const fill = collides ? COLLISION_FILL : VALID_FILL;
  const stroke = collides ? COLLISION_STROKE : VALID_STROKE;
  return (
    <>
      {devices.map((d) => {
        const dev = lookup(d.device_id);
        if (!dev) return null;
        const bbox = rotatedBoundingBox(dev, d.rotation);
        const x = d.position.x * CELL_PX;
        const y = d.position.y * CELL_PX;
        const w = bbox.width * CELL_PX;
        const h = bbox.height * CELL_PX;
        return (
          <Group key={d.instance_id}>
            <Rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={fill}
              stroke={stroke}
              strokeWidth={2}
              dash={[6, 4]}
            />
            <Group x={x} y={y} opacity={0.6}>
              <PortMarkers placed={d} device={dev} />
            </Group>
          </Group>
        );
      })}
      {links.map((l, i) => {
        const color = l.layer === 'solid' ? SOLID_LINK : FLUID_LINK;
        return (
          <Group key={`l-${i.toString()}`}>
            {l.path.map((c, j) => (
              <Rect
                key={j.toString()}
                x={c.x * CELL_PX + CELL_PX * 0.2}
                y={c.y * CELL_PX + CELL_PX * 0.2}
                width={CELL_PX * 0.6}
                height={CELL_PX * 0.6}
                fill={color}
                opacity={0.35}
                cornerRadius={2}
              />
            ))}
          </Group>
        );
      })}
    </>
  );
});

/** P4 v7.10: per-cell collision red wash. Renders in WORLD coords (the
 *  collidingCells set already holds post-translation cell keys), so this
 *  sits OUTSIDE the body's transform Group. Tiny set in practice (≤ 9-cell
 *  device overlap) so the per-cursor cost is negligible. */
function CollisionTints({ cells }: { cells: ReadonlySet<string> }) {
  if (cells.size === 0) return null;
  const rects: { key: string; x: number; y: number }[] = [];
  for (const key of cells) {
    const comma = key.indexOf(',');
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    rects.push({ key, x: x * CELL_PX, y: y * CELL_PX });
  }
  return (
    <>
      {rects.map((r) => (
        <Rect key={r.key} x={r.x} y={r.y} width={CELL_PX} height={CELL_PX} fill={COLLISION_FILL} />
      ))}
    </>
  );
}

/** P4 v7.10: AoE preview for any ghost device with `power_aoe`. Reads
 *  `ghostDevices` (post-translation positions) so the AoE box anchors at
 *  the device's NEW world location. Loops the full ghost device list but
 *  only renders for the few power devices, so cost is negligible even
 *  for large clusters. */
function AoePreview({
  ghostDevices,
  lookup,
  existingDevices,
}: {
  ghostDevices: readonly PlacedDevice[];
  lookup: (id: string) => Device | undefined;
  existingDevices: readonly PlacedDevice[] | undefined;
}) {
  return (
    <>
      {ghostDevices.map((d) => {
        const dev = lookup(d.device_id);
        if (!dev?.power_aoe) return null;
        const zone =
          previewSupplyZone(dev, d.position, d.rotation) ??
          previewPoleLinkZone(dev, d.position, d.rotation);
        if (!zone) return null;
        return (
          <Group key={`aoe-${d.instance_id}`}>
            <AoeBox zone={zone} kind={dev.power_aoe.purpose} />
            {dev.power_aoe.purpose === 'device_supply' && existingDevices && (
              <CoveredHighlight zone={zone} devices={existingDevices} lookup={lookup} />
            )}
          </Group>
        );
      })}
    </>
  );
}
