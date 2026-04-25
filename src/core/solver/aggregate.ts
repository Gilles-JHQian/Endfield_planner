/** Roll an ExpansionResult into the SolveResult shape: per-recipe nodes,
 *  raw_inputs, byproducts, and totals. Pure function — no IO.
 */
import type { DataBundle } from '@core/data-loader/index.ts';
import type { RecipeIndex, RecipeNode, SolveTarget } from './types.ts';
import type { ExpansionResult } from './expand.ts';

export interface AggregationResult {
  readonly nodes: readonly RecipeNode[];
  readonly raw_inputs: Readonly<Record<string, number>>;
  readonly byproducts: Readonly<Record<string, number>>;
  readonly total_power_draw: number;
  readonly total_footprint: number;
}

const EPSILON = 1e-9;

function pickMachine(
  recipe_compatible_devices: readonly string[],
  bundle: DataBundle,
): { id: string; power_draw: number; requires_power: boolean; area: number } | null {
  // Deterministic: lowest device id among compatibles.
  const sorted = [...recipe_compatible_devices].sort();
  for (const id of sorted) {
    const device = bundle.devices.find((d) => d.id === id);
    if (device) {
      return {
        id,
        power_draw: device.power_draw,
        requires_power: device.requires_power,
        area: device.footprint.width * device.footprint.height,
      };
    }
  }
  return null;
}

export function aggregate(
  bundle: DataBundle,
  index: RecipeIndex,
  expansion: ExpansionResult,
  target: SolveTarget,
): AggregationResult {
  const nodes: RecipeNode[] = [];

  // Track per-item flow to derive raw_inputs and byproducts after we know
  // all production rates.
  const produced = new Map<string, number>();
  const consumed = new Map<string, number>();
  // Final demand on the target item itself counts as "consumed" by the world.
  consumed.set(target.item_id, (consumed.get(target.item_id) ?? 0) + target.rate_per_minute);

  for (const [recipe_id, runs_per_minute] of expansion.runs_by_recipe) {
    const recipe = index.byId.get(recipe_id);
    if (!recipe) continue;

    const cycles_per_minute = 60 / recipe.cycle_seconds;
    const machine = pickMachine(recipe.compatible_devices, bundle);

    const machine_count = Math.max(0, Math.ceil(runs_per_minute - EPSILON));
    const power_draw = machine?.requires_power ? machine.power_draw * machine_count : 0;
    const footprint = machine ? machine.area * machine_count : 0;

    nodes.push({
      recipe_id,
      machine_id: machine?.id ?? null,
      runs_per_minute,
      machine_count,
      power_draw,
      footprint,
    });

    for (const out of recipe.outputs) {
      produced.set(
        out.item_id,
        (produced.get(out.item_id) ?? 0) + out.qty_per_cycle * cycles_per_minute * runs_per_minute,
      );
    }
    for (const inp of recipe.inputs) {
      consumed.set(
        inp.item_id,
        (consumed.get(inp.item_id) ?? 0) + inp.qty_per_cycle * cycles_per_minute * runs_per_minute,
      );
    }
  }

  const raw_inputs: Record<string, number> = {};
  const byproducts: Record<string, number> = {};
  const items = new Set([...produced.keys(), ...consumed.keys()]);
  for (const item of items) {
    const p = produced.get(item) ?? 0;
    const c = consumed.get(item) ?? 0;
    const net = c - p;
    if (net > EPSILON) {
      raw_inputs[item] = net;
    } else if (-net > EPSILON && item !== target.item_id) {
      byproducts[item] = -net;
    }
  }

  const total_power_draw = nodes.reduce((s, n) => s + n.power_draw, 0);
  const total_footprint = nodes.reduce((s, n) => s + n.footprint, 0);

  nodes.sort((a, b) => a.recipe_id.localeCompare(b.recipe_id));

  return { nodes, raw_inputs, byproducts, total_power_draw, total_footprint };
}
