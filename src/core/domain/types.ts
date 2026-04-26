/** Project domain types — the in-memory model the editor operates on.
 *  All fields readonly per REQUIREMENT.md §12; state transitions return new
 *  objects (see src/core/edits/).
 *
 *  Coordinate system per REQUIREMENT.md §6.4:
 *  - Grid origin top-left, x increases right, y increases down.
 *  - Rotations 0|90|180|270 only; 0° = device's unrotated frame.
 *  - Port (side, offset) coordinates are in the unrotated frame; geometry
 *    helpers in src/core/domain/geometry.ts transform them to world space.
 */

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A transport layer is either solid (belts) or fluid (pipes). Power is NOT
 *  a transport layer — Endfield supplies power wirelessly via 供电桩 AoE
 *  (REQUIREMENT.md §4.6), so devices need to sit inside a 供电桩 square but
 *  no power links are drawn on the grid. The canvas's "POWER" view (see
 *  ViewMode in src/ui/editor/use-view-mode.ts) is a visual overlay, not a
 *  routing layer. */
export type Layer = 'solid' | 'fluid';

export type Direction = 'N' | 'E' | 'S' | 'W';

/** 0 = unrotated, 90/180/270 = clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

/** Reference to a single port on a placed device. `port_index` is the index
 *  into the device's `io_ports` array (NOT a cell coordinate). */
export interface PortRef {
  readonly device_instance_id: string;
  readonly port_index: number;
}

/** A device dropped on the canvas. `device_id` references the catalog
 *  (`bundle.devices[*].id`); `recipe_id` is owner's per-instance choice from
 *  that device's `recipes[]` list (null = unset). */
export interface PlacedDevice {
  readonly instance_id: string;
  readonly device_id: string;
  readonly position: Cell;
  readonly rotation: Rotation;
  readonly recipe_id: string | null;
}

/** A belt or pipe link drawn between two ports.
 *  `path` is the inclusive list of cells the link occupies on its layer; the
 *  first/last cells are typically adjacent to src/dst port cells.
 *  `tier_id` references `bundle.transport_tiers.{solid_belts|fluid_pipes}[*].id`.
 *  src/dst optional because in-progress drafts may have only one anchored end. */
interface BaseLink {
  readonly id: string;
  readonly tier_id: string;
  readonly path: readonly Cell[];
  readonly src?: PortRef;
  readonly dst?: PortRef;
}

export interface SolidLink extends BaseLink {
  readonly layer: 'solid';
}

export interface FluidLink extends BaseLink {
  readonly layer: 'fluid';
}

export type Link = SolidLink | FluidLink;

export interface Plot {
  readonly width: number;
  readonly height: number;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly region_id: string;
  readonly data_version: string;
  readonly plot: Plot;
  readonly devices: readonly PlacedDevice[];
  readonly solid_links: readonly SolidLink[];
  readonly fluid_links: readonly FluidLink[];
  readonly created_at: string;
  readonly updated_at: string;
}

/** Discriminated result type used by every src/core/edits/ function. */
export type Result<T, E = EditError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type EditErrorKind =
  | 'out_of_bounds'
  | 'collision'
  | 'not_found'
  | 'invalid_recipe'
  | 'invalid_rotation'
  | 'shrink_conflict'
  | 'invalid_link';

export interface EditError {
  readonly kind: EditErrorKind;
  readonly message: string;
  /** For shrink_conflict: list of device instance ids that fall outside the new plot. */
  readonly conflicts?: readonly string[];
  /** Optional cell hint for UI to pan/highlight. */
  readonly at?: Cell;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err(
  kind: EditErrorKind,
  message: string,
  extra?: Partial<EditError>,
): Result<never, EditError> {
  return { ok: false, error: { kind, message, ...extra } };
}
