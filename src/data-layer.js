import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const versionRoot = (version) => resolve(process.cwd(), 'data', 'versions', version);

export async function loadDataBundle(version) {
  const root = versionRoot(version);
  const [devices, recipes, items, regions, crossing_rules] = await Promise.all([
    readJson(resolve(root, 'devices.json')),
    readJson(resolve(root, 'recipes.json')),
    readJson(resolve(root, 'items.json')),
    readJson(resolve(root, 'regions.json')),
    readJson(resolve(root, 'crossing_rules.json')),
  ]);

  return { version, devices, recipes, items, regions, crossing_rules };
}

export async function diffDataBundles(fromVersion, toVersion) {
  const [from, to] = await Promise.all([loadDataBundle(fromVersion), loadDataBundle(toVersion)]);

  return {
    missingDevices: subtractIds(from.devices, to.devices),
    changedDevices: changedById(from.devices, to.devices),
    missingRecipes: subtractIds(from.recipes, to.recipes),
    changedRecipes: changedById(from.recipes, to.recipes),
  };
}

function subtractIds(a, b) {
  const bIds = new Set(b.map((x) => x.id));
  return a.map((x) => x.id).filter((id) => !bIds.has(id));
}

function changedById(a, b) {
  const bMap = new Map(b.map((x) => [x.id, x]));
  return a
    .filter((x) => {
      const candidate = bMap.get(x.id);
      return candidate && JSON.stringify(x) !== JSON.stringify(candidate);
    })
    .map((x) => x.id);
}

async function readJson(file) {
  const raw = await readFile(file, 'utf-8');
  return JSON.parse(raw);
}
