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
import { SOLID_BRIDGE_IDS, FLUID_BRIDGE_IDS, layerOccupancyOf } from '@core/drc/bridges.ts';
import {
  buildLinkOrientations,
  routeForBelt,
  type BeltRouteOpts,
  type BeltRouteResult,
  type LinkOrient,
} from './path.ts';

const cellKey = (c: Cell): string => `${c.x.toString()},${c.y.toString()}`;

export interface ProjectRouteContext {
  readonly deviceWalls: ReadonlySet<string>;
  readonly sameLayerLinks: ReadonlyMap<string, ReadonlySet<'h' | 'v' | 'corner'>>;
  readonly existingBridges: ReadonlySet<string>;
  readonly bounds: { width: number; height: number };
  /** P4 v7.4 — true if the auto-placed cross-bridge for this layer also
   *  blocks the OTHER layer (pipe-cross-bridge: yes; belt-cross-bridge: no). */
  readonly crossBridgeBlocksOtherLayer: boolean;
  /** P4 v7.4 — cells occupied on the OTHER layer (devices that block it +
   *  same-other-layer link cells). Consulted by the planner only when
   *  `crossBridgeBlocksOtherLayer` is true. */
  readonly otherLayerOccupants: ReadonlySet<string>;
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

  // P4 v7.4 — for the routing layer's cross-bridge, does it also block the
  // OTHER layer? Pipe-cross-bridge has layerOccupancy='both'; belt-cross-
  // bridge has 'solid' only. We use this + the other layer's occupants
  // (devices blocking that layer + that layer's link cells) so the planner
  // can flag pipe-over-belt auto-bridges as collisions before commit.
  const crossBridgeDevice = lookup(crossBridgeId);
  const crossBridgeBlocksOtherLayer = crossBridgeDevice
    ? layerOccupancyOf(crossBridgeDevice) === 'both'
    : false;
  const otherLayer: Layer = layer === 'solid' ? 'fluid' : 'solid';
  const otherLayerOccupants = new Set<string>();
  if (crossBridgeBlocksOtherLayer) {
    for (const placed of project.devices) {
      const dev = lookup(placed.device_id);
      if (!dev) continue;
      const occ = layerOccupancyOf(dev);
      const blocksOther =
        occ === 'both' || (otherLayer === 'solid' ? occ === 'solid' : occ === 'fluid');
      if (!blocksOther) continue;
      for (const c of footprintCells(dev, placed)) otherLayerOccupants.add(cellKey(c));
    }
    const otherLinks =
      otherLayer === 'solid' ? project.solid_links : project.fluid_links;
    for (const l of otherLinks) {
      for (const c of l.path) otherLayerOccupants.add(cellKey(c));
    }
  }

  return {
    deviceWalls,
    sameLayerLinks,
    existingBridges,
    bounds: project.plot,
    crossBridgeBlocksOtherLayer,
    otherLayerOccupants,
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
  lastStepDirection?: { dx: number; dy: number },
): PlanSegmentsResult {
  const segments: BeltRouteResult[] = [];
  const path: Cell[] = [];
  const bridgesToAutoPlace: Cell[] = [];
  const collisions: Cell[] = [];
  let prevHeading = initialHeading;
  let endHeading = initialHeading;

  // P4 v7.5 — track the new belt's own accumulated path orientations so the
  // self-cross case (path crosses a previously-planned segment of the SAME
  // draft) gets an auto-bridge just like crossing an existing link. We start
  // with a clone of ctx.sameLayerLinks (the project's existing links) and
  // grow it as each segment is planned.
  const combinedSameLayerLinks = new Map<string, Set<LinkOrient>>();
  for (const [k, set] of ctx.sameLayerLinks) combinedSameLayerLinks.set(k, new Set(set));

  for (let i = 0; i < waypoints.length - 1; i++) {
    const isLastSegment = i === waypoints.length - 2;
    const opts: BeltRouteOpts = {
      deviceWalls: ctx.deviceWalls,
      sameLayerLinks: combinedSameLayerLinks,
      existingBridges: ctx.existingBridges,
      bounds: ctx.bounds,
      prevHeading,
      ...(i === 0 && firstStepDirection ? { firstStepDirection } : {}),
      ...(isLastSegment && lastStepDirection ? { lastStepDirection } : {}),
      crossBridgeBlocksOtherLayer: ctx.crossBridgeBlocksOtherLayer,
      otherLayerOccupants: ctx.otherLayerOccupants,
    };
    const seg = routeForBelt(waypoints[i]!, waypoints[i + 1]!, opts);
    segments.push(seg);
    if (i === 0) path.push(...seg.path);
    else path.push(...seg.path.slice(1)); // skip joint duplicate
    bridgesToAutoPlace.push(...seg.bridgesToAutoPlace);
    collisions.push(...seg.collisions);
    // Accumulate this segment's cell orientations into the shared map so the
    // NEXT segment's routeForBelt sees them as if they were existing links —
    // self-crossing then triggers auto-bridge identically to crossing other
    // belts. SKIP this segment's LAST cell (= next segment's first cell);
    // that's the waypoint joint, not a real second crossing — adding it
    // would cause the next segment's first cell to register as a self-cross
    // at the joint (extending → parallel collision; turning → spurious
    // auto-bridge). We use the full path for orient computation but drop
    // the last-cell entry from the accumulation. P4 v7.5 fix.
    if (seg.path.length >= 2) {
      const segOrient = buildLinkOrientations([{ path: seg.path }]);
      const last = seg.path[seg.path.length - 1]!;
      const lastKey = `${last.x.toString()},${last.y.toString()}`;
      for (const [k, set] of segOrient) {
        if (k === lastKey) continue;
        let combined = combinedSameLayerLinks.get(k);
        if (!combined) {
          combined = new Set();
          combinedSameLayerLinks.set(k, combined);
        }
        for (const o of set) combined.add(o);
      }
    }
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

/** Find an output port at the given world cell. Returns its face_direction
 *  (for first-step lock) AND its PortRef fields (so the link's `src` can be
 *  populated, P4 v6).
 *
 *  P4 v7: optional `departure` parameter filters by direction the user intends
 *  to leave the cell. Required for multi-output ports that share a cell — e.g.
 *  belt-splitter (1×1, output ports on N/E/S faces all at the same cell).
 *  Without `departure`, the first matching port is returned (legacy
 *  single-port-per-cell behavior). */
export function findOutputPortAtCell(
  cell: Cell,
  layer: Layer,
  project: Project,
  lookup: (id: string) => Device | undefined,
  departure?: { dx: number; dy: number },
): {
  device_instance_id: string;
  port_index: number;
  face_direction: { dx: number; dy: number };
} | null {
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const p of portsInWorldFrame(dev, placed)) {
      if (p.cell.x !== cell.x || p.cell.y !== cell.y) continue;
      if (p.direction_constraint !== 'output') continue;
      const matches =
        (layer === 'solid' && p.kind === 'solid') || (layer === 'fluid' && p.kind === 'fluid');
      if (!matches) continue;
      if (departure && (p.face_direction.dx !== departure.dx || p.face_direction.dy !== departure.dy)) {
        continue;
      }
      return {
        device_instance_id: placed.instance_id,
        port_index: p.port_index,
        face_direction: p.face_direction,
      };
    }
  }
  return null;
}

/** True if `cell` hosts ≥ 2 output ports of the matching layer (different
 *  faces). Used by the live ghost to decide whether to lock the first-step
 *  direction (single port → lock to its face) or leave it free (multiple
 *  ports → wait for the user's first move to disambiguate). P4 v7. */
export function hasMultipleOutputPortsAtCell(
  cell: Cell,
  layer: Layer,
  project: Project,
  lookup: (id: string) => Device | undefined,
): boolean {
  let count = 0;
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const p of portsInWorldFrame(dev, placed)) {
      if (p.cell.x !== cell.x || p.cell.y !== cell.y) continue;
      if (p.direction_constraint !== 'output') continue;
      const matches =
        (layer === 'solid' && p.kind === 'solid') || (layer === 'fluid' && p.kind === 'fluid');
      if (matches) {
        count += 1;
        if (count >= 2) return true;
      }
    }
  }
  return false;
}

/** Find an input port at world cell `cell` of the matching layer. Returns the
 *  PortRef + the direction the link must arrive in (i.e. opposite of the
 *  port's outward face direction).
 *
 *  P4 v6: a belt arriving from a wrong direction is no longer a valid commit.
 *  Pass the actual arrival direction to check; if the port faces north and
 *  the link arrives from the south, the arrival vector is (0, -1) (going
 *  north into the port) and matches `-port.face_direction`. If `arrival` is
 *  omitted, the cell match alone suffices (back-compat for legacy callers
 *  that don't yet have a direction). */
export function findInputPortAtCell(
  cell: Cell,
  layer: Layer,
  project: Project,
  lookup: (id: string) => Device | undefined,
  arrival?: { dx: number; dy: number },
): {
  device_instance_id: string;
  port_index: number;
  /** Required arrival direction (= -port.face_direction). Useful for the
   *  caller to feed back into routeForBelt's `lastStepDirection`. */
  arrival_direction: { dx: number; dy: number };
} | null {
  for (const placed of project.devices) {
    const dev = lookup(placed.device_id);
    if (!dev) continue;
    for (const p of portsInWorldFrame(dev, placed)) {
      if (p.cell.x !== cell.x || p.cell.y !== cell.y) continue;
      if (p.direction_constraint !== 'input') continue;
      const matches =
        (layer === 'solid' && p.kind === 'solid') || (layer === 'fluid' && p.kind === 'fluid');
      if (!matches) continue;
      // Normalize -0 → 0 so deep-equal comparisons in tests / callers don't
      // trip on the JS sign-of-zero quirk when negating a 0 dx/dy.
      const required = {
        dx: p.face_direction.dx === 0 ? 0 : -p.face_direction.dx,
        dy: p.face_direction.dy === 0 ? 0 : -p.face_direction.dy,
      };
      if (arrival && (arrival.dx !== required.dx || arrival.dy !== required.dy)) continue;
      return {
        device_instance_id: placed.instance_id,
        port_index: p.port_index,
        arrival_direction: required,
      };
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
