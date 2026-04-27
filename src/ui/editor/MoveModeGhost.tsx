/** P4 v7.3 — multi-device + multi-link cursor-following ghost rendered while
 *  the user is in move mode. Each device is drawn as a low-opacity rect with
 *  port markers (matching the placement ghost / DeviceLayer style). Cells in
 *  the colliding-set are tinted red so owners can see exactly which cells
 *  block the placement; otherwise the whole ghost reads green.
 *
 *  P4 v7.8: power-diffuser / repeater devices in the snapshot also render
 *  their candidate AoE as a dashed box so owners can see what supply zone
 *  the new placement would create — symmetric with the place-tool ghost.
 */
import { Group, Rect } from 'react-konva';
import { footprintCells, rotatedBoundingBox } from '@core/domain/geometry.ts';
import { previewPoleLinkZone, previewSupplyZone } from '@core/domain/power-coverage.ts';
import type { Cell, Layer, PlacedDevice } from '@core/domain/types.ts';
import type { Device } from '@core/data-loader/types.ts';
import { CELL_PX } from './use-camera.ts';
import { PortMarkers } from './DeviceLayer.tsx';
import { AoeBox } from './GhostPreview.tsx';

interface MoveGhostShape {
  devices: PlacedDevice[];
  links: { layer: Layer; tier_id: string; path: Cell[] }[];
  collides: boolean;
  collidingCells: Set<string>;
}

interface Props {
  ghost: MoveGhostShape;
  lookup: (id: string) => Device | undefined;
}

const VALID_FILL = 'rgba(109, 194, 109, 0.18)';
const COLLISION_FILL = 'rgba(232, 93, 74, 0.28)';
const VALID_STROKE = '#6dc26d';
const COLLISION_STROKE = '#e85d4a';
const SOLID_LINK = '#ff9a3d';
const FLUID_LINK = '#4ec9d3';

export function MoveModeGhost({ ghost, lookup }: Props) {
  return (
    <Group listening={false} opacity={0.85}>
      {/* P4 v7.8: AoE preview for any ghost device with `power_aoe`. Drawn
       *  underneath the device rects so the dashed box doesn't obscure the
       *  device outline at the corners. */}
      {ghost.devices.map((d) => {
        const dev = lookup(d.device_id);
        if (!dev?.power_aoe) return null;
        const zone =
          previewSupplyZone(dev, d.position, d.rotation) ??
          previewPoleLinkZone(dev, d.position, d.rotation);
        if (!zone) return null;
        return <AoeBox key={`aoe-${d.instance_id}`} zone={zone} kind={dev.power_aoe.purpose} />;
      })}
      {ghost.devices.map((d) => {
        const dev = lookup(d.device_id);
        if (!dev) return null;
        const bbox = rotatedBoundingBox(dev, d.rotation);
        const x = d.position.x * CELL_PX;
        const y = d.position.y * CELL_PX;
        const w = bbox.width * CELL_PX;
        const h = bbox.height * CELL_PX;
        // Per-cell collision shading: any footprint cell in the colliding set
        // gets a red tint so owners can see which cells block.
        const cellTints = footprintCells(dev, d).map((c, i) => {
          const k = `${c.x.toString()},${c.y.toString()}`;
          if (!ghost.collidingCells.has(k)) return null;
          return (
            <Rect
              key={`c-${i.toString()}`}
              x={c.x * CELL_PX}
              y={c.y * CELL_PX}
              width={CELL_PX}
              height={CELL_PX}
              fill={COLLISION_FILL}
            />
          );
        });
        return (
          <Group key={d.instance_id}>
            {cellTints}
            <Rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={ghost.collides ? COLLISION_FILL : VALID_FILL}
              stroke={ghost.collides ? COLLISION_STROKE : VALID_STROKE}
              strokeWidth={2}
              dash={[6, 4]}
            />
            <Group x={x} y={y} opacity={0.6}>
              <PortMarkers placed={d} device={dev} />
            </Group>
          </Group>
        );
      })}
      {ghost.links.map((l, i) => {
        const color = l.layer === 'solid' ? SOLID_LINK : FLUID_LINK;
        return (
          <Group key={`l-${i.toString()}`}>
            {l.path.map((c, j) => {
              const k = `${c.x.toString()},${c.y.toString()}`;
              const collides = ghost.collidingCells.has(k);
              return (
                <Group key={j.toString()}>
                  {/* P4 v7.4: red wash on colliding link cells. */}
                  {collides && (
                    <Rect
                      x={c.x * CELL_PX}
                      y={c.y * CELL_PX}
                      width={CELL_PX}
                      height={CELL_PX}
                      fill={COLLISION_FILL}
                    />
                  )}
                  <Rect
                    x={c.x * CELL_PX + CELL_PX * 0.2}
                    y={c.y * CELL_PX + CELL_PX * 0.2}
                    width={CELL_PX * 0.6}
                    height={CELL_PX * 0.6}
                    fill={color}
                    opacity={0.35}
                    cornerRadius={2}
                  />
                </Group>
              );
            })}
          </Group>
        );
      })}
    </Group>
  );
}
