const EPSILON = 1e-6;

function pickRecipe(recipes, itemId, regionId) {
  return recipes.find((recipe) =>
    recipe.outputs.some((output) => output.itemId === itemId) &&
    (!recipe.regions || recipe.regions.includes(regionId)),
  );
}

export function solveThroughput(target, bundle) {
  const runsByRecipe = new Map();
  const visiting = new Set();

  function demand(itemId, ratePerMinute) {
    if (ratePerMinute <= EPSILON) {
      return;
    }

    const recipe = pickRecipe(bundle.recipes, itemId, target.regionId);
    if (!recipe) {
      return;
    }

    const out = recipe.outputs.find((output) => output.itemId === itemId);
    if (!out) {
      return;
    }

    const cyclesPerMinute = 60 / recipe.cycleSeconds;
    const runsNeeded = ratePerMinute / (out.qtyPerCycle * cyclesPerMinute);

    runsByRecipe.set(recipe.id, (runsByRecipe.get(recipe.id) ?? 0) + runsNeeded);

    if (visiting.has(recipe.id)) {
      return;
    }
    visiting.add(recipe.id);

    for (const input of recipe.inputs) {
      demand(input.itemId, input.qtyPerCycle * cyclesPerMinute * runsNeeded);
    }

    visiting.delete(recipe.id);
  }

  demand(target.itemId, target.ratePerMinute);

  const nodes = [];
  const producedItems = new Set();
  for (const recipeId of runsByRecipe.keys()) {
    const recipe = bundle.recipes.find((entry) => entry.id === recipeId);
    if (!recipe) continue;

    for (const out of recipe.outputs) producedItems.add(out.itemId);

    const device = bundle.devices.find((entry) => recipe.compatibleDevices.includes(entry.id));
    const runsPerMinute = runsByRecipe.get(recipeId) ?? 0;
    const machineCount = Math.ceil(runsPerMinute - EPSILON);
    const powerDraw = device && device.requiresPower ? device.powerDraw * machineCount : 0;

    nodes.push({ recipeId, runsPerMinute, machineCount, powerDraw });
  }

  const rawInputs = {};
  for (const node of nodes) {
    const recipe = bundle.recipes.find((entry) => entry.id === node.recipeId);
    if (!recipe) continue;

    const cyclesPerMinute = 60 / recipe.cycleSeconds;
    for (const input of recipe.inputs) {
      if (producedItems.has(input.itemId)) continue;
      rawInputs[input.itemId] = (rawInputs[input.itemId] ?? 0) + node.runsPerMinute * cyclesPerMinute * input.qtyPerCycle;
    }
  }

  const totalPowerDraw = nodes.reduce((sum, node) => sum + node.powerDraw, 0);
  const totalFootprint = nodes.reduce((sum, node) => {
    const recipe = bundle.recipes.find((entry) => entry.id === node.recipeId);
    const device = bundle.devices.find((entry) => recipe && recipe.compatibleDevices.includes(entry.id));
    return device ? sum + device.width * device.height * node.machineCount : sum;
  }, 0);

  return {
    target,
    nodes: nodes.sort((a, b) => a.recipeId.localeCompare(b.recipeId)),
    rawInputs,
    totalPowerDraw,
    totalFootprint,
  };
}
