import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseVersionArg() {
  const i = process.argv.indexOf('--version');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Usage: pnpm scrape:endwiki --version <version>');
  return process.argv[i + 1];
}

async function main() {
  const version = parseVersionArg();
  const outDir = path.join(process.cwd(), 'data', 'versions', version);
  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  await writeFile(path.join(outDir, 'items.json'), JSON.stringify([
    { id: 'iron-ore', displayName: '铁矿石', kind: 'solid' },
    { id: 'iron-ingot', displayName: '铁锭', kind: 'solid' },
    { id: 'battery', displayName: '高谷电池', kind: 'solid' },
    { id: 'water', displayName: '清水', kind: 'fluid' }
  ], null, 2));

  await writeFile(path.join(outDir, 'devices.json'), JSON.stringify([
    { id: 'smelter-1', displayName: '精炼炉', width: 3, height: 2, powerDraw: 80, requiresPower: true, recipes: ['smelt-iron'] },
    { id: 'assembler-1', displayName: '组装机', width: 3, height: 3, powerDraw: 120, requiresPower: true, recipes: ['craft-battery'] }
  ], null, 2));

  await writeFile(path.join(outDir, 'recipes.json'), JSON.stringify([
    { id: 'smelt-iron', displayName: '炼铁', cycleSeconds: 30, inputs: [{ itemId: 'iron-ore', qtyPerCycle: 2 }], outputs: [{ itemId: 'iron-ingot', qtyPerCycle: 1 }], compatibleDevices: ['smelter-1'], regions: ['valley_4', 'wuling'] },
    { id: 'craft-battery', displayName: '高谷电池', cycleSeconds: 60, inputs: [{ itemId: 'iron-ingot', qtyPerCycle: 3 }, { itemId: 'water', qtyPerCycle: 1 }], outputs: [{ itemId: 'battery', qtyPerCycle: 1 }], compatibleDevices: ['assembler-1'], regions: ['wuling'] }
  ], null, 2));

  await writeFile(path.join(outDir, 'regions.json'), JSON.stringify([
    { id: 'valley_4', plotDefaultSize: { width: 80, height: 80 }, availableTechTiers: ['t1', 't2'] },
    { id: 'wuling', plotDefaultSize: { width: 90, height: 90 }, availableTechTiers: ['t1', 't2', 't3'] }
  ], null, 2));

  await writeFile(path.join(outDir, 'generated.meta.json'), JSON.stringify({ version, generatedAt }, null, 2));
  console.log(`Generated version ${version} at ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
