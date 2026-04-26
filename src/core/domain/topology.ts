/** Project topology helpers (P4 v6).
 *
 *  The Link / Device / PortRef domain types in `types.ts` are the canonical
 *  representation: every link carries optional `src` / `dst` PortRef fields
 *  pointing at a device + port_index. These helpers derive the inverse view
 *  ("which link is connected to this port?") and resolve the item a link
 *  carries from the source device's recipe.
 *
 *  All derived — never persisted — so the helpers are safe to recompute on
 *  every project change. Callers should memoize at the React boundary.
 */
import type { Link, PortRef, Project } from './types.ts';
import type { Device, Recipe } from '@core/data-loader/types.ts';

export type PortKey = string;

/** "${instance_id}:${port_index}" — the canonical key for a port. */
export function portKey(ref: PortRef): PortKey {
  return `${ref.device_instance_id}:${ref.port_index.toString()}`;
}

export interface PortConnectivity {
  /** PortKey → Link.id. Reverse index: ask "which link connects to port X?". */
  readonly portToLink: ReadonlyMap<PortKey, string>;
  /** Link.id → Link. Convenience for downstream lookups so callers don't
   *  re-scan project.solid_links + project.fluid_links. */
  readonly linkById: ReadonlyMap<string, Link>;
}

/** Build the port→link reverse index for the project. A port can host AT MOST
 *  one link (DRC rule PORT_002 forbids two outputs into one cell, etc.); when
 *  multiple links currently reference the same port the LAST one wins (the
 *  caller is responsible for surfacing the DRC violation separately). */
export function buildPortConnectivity(project: Project): PortConnectivity {
  const portToLink = new Map<PortKey, string>();
  const linkById = new Map<string, Link>();
  const all: Link[] = [...project.solid_links, ...project.fluid_links];
  for (const link of all) {
    linkById.set(link.id, link);
    if (link.src) portToLink.set(portKey(link.src), link.id);
    if (link.dst) portToLink.set(portKey(link.dst), link.id);
  }
  return { portToLink, linkById };
}

/** Resolve the item_id this link carries by walking source device → recipe →
 *  outputs. Returns null when the source is unset, the device is not in the
 *  catalog, the recipe is unset, or the recipe has multiple outputs (port→
 *  output mapping is not yet specified — see REQUIREMENT.md §10.x).
 *
 *  Single-output recipes (the common case for first-tier production) resolve
 *  unambiguously to that one item. */
export function linkItem(
  link: Link,
  project: Project,
  lookup: (id: string) => Device | undefined,
  recipes: readonly Recipe[],
): string | null {
  if (!link.src) return null;
  const placed = project.devices.find((d) => d.instance_id === link.src!.device_instance_id);
  if (!placed?.recipe_id) return null;
  const dev = lookup(placed.device_id);
  if (!dev) return null;
  const recipe = recipes.find((r) => r.id === placed.recipe_id);
  if (!recipe) return null;
  if (recipe.outputs.length === 1) return recipe.outputs[0]!.item_id;
  // Multi-output recipes need an explicit port→output mapping (deferred).
  return null;
}
