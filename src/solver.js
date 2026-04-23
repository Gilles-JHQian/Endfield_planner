export function solveThroughput(bundle, target) {
  const recipeByOutput = buildRecipeByOutput(bundle.recipes);
  const deviceById = new Map(bundle.devices.map((d) => [d.id, d]));

  const nodes = [];
  const raw_inputs = {};
  const visiting = new Set();

  const walk = (itemId, ratePerMinute) => {
    const recipe = recipeByOutput.get(itemId);
    if (!recipe) {
      raw_inputs[itemId] = (raw_inputs[itemId] ?? 0) + ratePerMinute;
      return;
    }

    const guardKey = `${recipe.id}:${itemId}`;
    if (visiting.has(guardKey)) {
      raw_inputs[itemId] = (raw_inputs[itemId] ?? 0) + ratePerMinute;
      return;
    }
    visiting.add(guardKey);

    const outputPerCycle = recipe.outputs.find((o) => o.item_id === itemId)?.qty_per_cycle ?? 0;
    const cyclesPerMinute = ratePerMinute / outputPerCycle;
    const perMachineCyclesPerMinute = 60 / recipe.cycle_seconds;
    const machineCount = Math.ceil(cyclesPerMinute / perMachineCyclesPerMinute);
    const machineId = recipe.compatible_devices[0] ?? 'unknown-machine';

    nodes.push({
      recipe_id: recipe.id,
      machine_id: machineId,
      required_rate_per_minute: ratePerMinute,
      machine_count: machineCount,
    });

    for (const input of recipe.inputs) {
      walk(input.item_id, input.qty_per_cycle * cyclesPerMinute);
    }

    visiting.delete(guardKey);
  };

  walk(target.item_id, target.rate_per_minute);

  const total_power_draw = nodes.reduce((sum, node) => {
    const device = deviceById.get(node.machine_id);
    return sum + (device?.power_draw ?? 0) * node.machine_count;
  }, 0);

  const total_footprint = nodes.reduce((sum, node) => {
    const device = deviceById.get(node.machine_id);
    if (!device) return sum;
    return sum + device.footprint.width * device.footprint.height * node.machine_count;
  }, 0);

  return { target, nodes, raw_inputs, total_power_draw, total_footprint };
}

function buildRecipeByOutput(recipes) {
  const mapping = new Map();
  for (const recipe of recipes) {
    for (const out of recipe.outputs) {
      if (!mapping.has(out.item_id)) {
        mapping.set(out.item_id, recipe);
      }
    }
  }
  return mapping;
}
