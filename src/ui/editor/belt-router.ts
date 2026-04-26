/** Project-aware wrapper around routeForBelt.
 *
 *  The pure routeForBelt planner takes per-cell wall/link/bridge sets. This
 *  helper builds those sets from the current project + bundle, and provides
 *  a convenient `planSegments` that walks a list of waypoints, threading
 *  prevHeading through and concatenating the per-segment paths.
 *
 *  Used by EditorPage's ghost preview and commit flow so both follow the same
 *  routing rules.
 */
import { footprintCells, portsInWorldFrame } from '@core/domain/geometry.ts';
import type { Cell, Layer, Project } from '@core/domain/types.ts';
import type { DataBundle, Device } from '@core/data-loader/types.ts';
import { SOLID_BRIDGE_IDS, FLUID_BRIDGE_IDS } from '@core/drc/bridges.ts';
import {
  buildLinkOrientations,
  routeForBelt,
  type BeltRouteOpts,
  type BeltRouteResult,
} from './path.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export interface ProjectRouteContext {
  readonly deviceWalls: ReadonlySet<string>;
  readonly sameLayerLinks: ReadonlyMap<string, ReadonlySet<'h' | 'v' | 'corner'>>;
  readonly existingBridges: ReadonlySet<string>;
  readonly bounds: { width: number; height: number };
}

export function buildRouteContext(
  project: Project,
  layer: Layer,
  lookup: (id: string) => Device | undefined,
): ProjectRouteContext {
  const deviceWalls = new Set<string>();
  const existingBridges = new Set<string>();
  const bridgeIds = layer === 'solid' ? SOLID_BRIDGE_IDS : FLUID_BRIDGE_IDS;
  // Cross-bridge id specifically — only this one allows perpendicular crossings.
  const crossBridgeId = layer === 'solid' ? 'belt-cross-bridge' : 'pipe-cross-bridge';
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    const cells = footprintCells(dev, placed);
    if (placed.device_id === crossBridgeId) {
      for (const c of cells) existingBridges.add(cellKey(c));
      // Cross-bridges are NOT walls — belts pass through them at their port cells.
      continue;
    }
    if (bridgeIds.has(placed.device_id)) {
      // Mergers/splitters are walls except at their port cells; for the MVP
      // we treat their whole footprint as a wall and rely on the user landing
      // the belt's endpoint at the bridge's port cell (handled by endpoint
      // exemption). Conservative but correct.
      for (const c of cells) deviceWalls.add(cellKey(c));
      continue;
    }
    for (const c of cells) deviceWalls.add(cellKey(c));
  }
  const links = layer === 'solid' ? project.solid_links : project.fluid_links;
  const sameLayerLinks = buildLinkOrientations(links);
  return {
    deviceWalls,
    sameLayerLinks,
    existingBridges,
    bounds: project.plot,
  };
}

export interface PlanSegmentsResult {
  /** Per-segment routing results in waypoint-pair order. */
  readonly segments: readonly BeltRouteResult[];
  /** Joined path across all segments (deduped at joints). */
  readonly path: readonly Cell[];
  /** All cells across all segments that need a fresh cross-bridge. */
  readonly bridgesToAutoPlace: readonly Cell[];
  /** All collision cells across all segments. */
  readonly collisions: readonly Cell[];
  /** Heading at the end of the final segment (unit cardinal vector), or null
   *  if there are no segments. Used so the live cursor segment can pick up
   *  the heading from the last committed waypoint. */
  readonly endHeading: { dx: number; dy: number } | null;
}

export function planSegments(
  waypoints: readonly Cell[],
  ctx: ProjectRouteContext,
  initialHeading: { dx: number; dy: number } | null = null,
  firstStepDirection?: { dx: number; dy: number },
): PlanSegmentsResult {
  const segments: BeltRouteResult[] = [];
  const path: Cell[] = [];
  const bridgesToAutoPlace: Cell[] = [];
  const collisions: Cell[] = [];
  let prevHeading = initialHeading;
  let endHeading = initialHeading;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const opts: BeltRouteOpts = {
      deviceWalls: ctx.deviceWalls,
      sameLayerLinks: ctx.sameLayerLinks,
      existingBridges: ctx.existingBridges,
      bounds: ctx.bounds,
      prevHeading,
      ...(i === 0 && firstStepDirection ? { firstStepDirection } : {}),
    };
    const seg = routeForBelt(waypoints[i]!, waypoints[i + 1]!, opts);
    segments.push(seg);
    if (i === 0) path.push(...seg.path);
    else path.push(...seg.path.slice(1)); // skip joint duplicate
    bridgesToAutoPlace.push(...seg.bridgesToAutoPlace);
    collisions.push(...seg.collisions);
    if (seg.path.length >= 2) {
      const last = seg.path[seg.path.length - 1]!;
      const prev = seg.path[seg.path.length - 2]!;
      const dx = Math.sign(last.x - prev.x);
      const dy = Math.sign(last.y - prev.y);
      prevHeading = { dx, dy };
      endHeading = prevHeading;
    }
  }

  if (path.length === 0 && waypoints.length > 0) path.push(waypoints[0]!);

  return { segments, path, bridgesToAutoPlace, collisions, endHeading };
}

/** Find an output port at the given world cell. Used so the first segment's
 *  firstStepDirection can be locked to the port's face direction. */
export function findOutputPortAtCell(
  cell: Cell,
  layer: Layer,
  project: Project,
  lookup: (id: string) => Device | undefined,
): { face_direction: { dx: number; dy: number } } | null {
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const p of portsInWorldFrame(dev, placed)) {
      if (p.cell.x !== cell.x || p.cell.y !== cell.y) continue;
      if (p.direction_constraint !== 'output') continue;
      const matches =
        (layer === 'solid' && p.kind === 'solid') || (layer === 'fluid' && p.kind === 'fluid');
      if (matches) return { face_direction: p.face_direction };
    }
  }
  return null;
}

/** The cross-bridge device id for the layer. */
export function crossBridgeId(layer: Layer): string {
  return layer === 'solid' ? 'belt-cross-bridge' : 'pipe-cross-bridge';
}

/** Default tier id for new links of a layer, picking the first tier in the bundle. */
export function defaultTierId(bundle: DataBundle, layer: Layer): string {
  if (layer === 'solid') return bundle.transport_tiers.solid_belts[0]?.id ?? 'belt-1';
  return bundle.transport_tiers.fluid_pipes[0]?.id ?? 'pipe-wuling';
}
