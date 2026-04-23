import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export async function loadDataVersion(version) {
  const base = path.join(process.cwd(), 'data', 'versions', version);
  const [devices, recipes, items, regions] = await Promise.all([
    loadJson(path.join(base, 'devices.json')),
    loadJson(path.join(base, 'recipes.json')),
    loadJson(path.join(base, 'items.json')),
    loadJson(path.join(base, 'regions.json')),
  ]);

  return { devices, recipes, items, regions };
}
