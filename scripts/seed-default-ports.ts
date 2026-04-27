/** P4 v7.6 — one-shot seed for default I/O port geometry on
 *  `basic_production` + `synthesis` devices.
 *
 *  Owner spec: every device in these two categories should default to
 *    - top face (N): one INPUT solid port per cell along the face;
 *    - bottom face (S): one OUTPUT solid port per cell along the face.
 *  Owners then fine-tune via the device editor (§5.4) for the few devices
 *  that need fluid ports, side ports, etc.
 *
 *  This script overwrites `io_ports` for every device whose category is in
 *  TARGET_CATEGORIES. Run it once after `pnpm scrape:endwiki` lands a fresh
 *  device catalog. After owner fine-tuning, do NOT re-run — it would clobber
 *  the manual edits.
 *
 *  Usage:
 *    pnpm seed:default-ports                  # write data/versions/1.2/devices.json
 *    pnpm seed:default-ports --dry-run        # show diff, write nothing
 *    pnpm seed:default-ports --version 1.3    # target a different version dir
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const TARGET_CATEGORIES = new Set(['basic_production', 'synthesis']);

interface IoPort {
  side: 'N' | 'E' | 'S' | 'W';
  offset: number;
  kind: 'solid' | 'fluid' | 'power';
  direction_constraint: 'input' | 'output' | 'bidirectional' | 'paired_opposite';
}

interface Device {
  id: string;
  category: string;
  footprint: { width: number; height: number };
  io_ports?: IoPort[];
  [key: string]: unknown;
}

/** Build the N-input + S-output port set for a footprint of width W. The
 *  N face has W cells (offsets 0..W-1), each gets one INPUT solid port; the
 *  S face is the symmetric output. Height does not affect the port set
 *  because the rule only populates the top + bottom faces. */
export function defaultNorthSouthPorts(width: number): IoPort[] {
  const ports: IoPort[] = [];
  for (let i = 0; i < width; i++) {
    ports.push({ side: 'N', offset: i, kind: 'solid', direction_constraint: 'input' });
  }
  for (let i = 0; i < width; i++) {
    ports.push({ side: 'S', offset: i, kind: 'solid', direction_constraint: 'output' });
  }
  return ports;
}

interface SeedDiff {
  id: string;
  category: string;
  before: number;
  after: number;
  changed: boolean;
}

export function applySeed(devices: Device[]): SeedDiff[] {
  const diffs: SeedDiff[] = [];
  for (const d of devices) {
    if (!TARGET_CATEGORIES.has(d.category)) continue;
    const before = d.io_ports?.length ?? 0;
    const next = defaultNorthSouthPorts(d.footprint.width);
    const same = JSON.stringify(d.io_ports ?? []) === JSON.stringify(next);
    d.io_ports = next;
    diffs.push({
      id: d.id,
      category: d.category,
      before,
      after: next.length,
      changed: !same,
    });
  }
  return diffs;
}

async function loadSchema(version: string): Promise<AnySchema> {
  void version; // Schema is version-independent in current layout.
  const path = resolve(repoRoot, 'data', 'schema', 'devices.schema.json');
  return JSON.parse(await readFile(path, 'utf8')) as AnySchema;
}

interface CliArgs {
  version: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { version: '1.2', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--version') {
      const next = argv[i + 1];
      if (!next) throw new Error('--version requires a value');
      args.version = next;
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const { version, dryRun } = parseArgs(process.argv.slice(2));
  const devicesPath = resolve(repoRoot, 'data', 'versions', version, 'devices.json');
  const raw = await readFile(devicesPath, 'utf8');
  const devices = JSON.parse(raw) as Device[];

  const diffs = applySeed(devices);
  const changed = diffs.filter((d) => d.changed);
  console.log(
    `\nseed-default-ports → ${devicesPath}\n` +
      `  scanned:  ${diffs.length.toString()} devices in {${[...TARGET_CATEGORIES].join(', ')}}\n` +
      `  unchanged: ${(diffs.length - changed.length).toString()}\n` +
      `  changed:   ${changed.length.toString()}\n`,
  );
  for (const d of changed) {
    console.log(`    + ${d.id.padEnd(28)} (${d.category}) ports: ${d.before} → ${d.after}`);
  }

  // Validate before writing — fail fast if the seed produced invalid data.
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(await loadSchema(version));
  if (!validate(devices)) {
    console.error('\n✗ Schema validation failed after seeding:');
    console.error(`  ${ajv.errorsText(validate.errors, { separator: '\n  ' })}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry-run: no files written.');
    return;
  }
  if (changed.length === 0) {
    console.log('No changes; skipping write.');
    return;
  }

  // Atomic write: temp file + rename.
  const tmp = `${devicesPath}.tmp`;
  const serialized = JSON.stringify(devices, null, 2) + '\n';
  await writeFile(tmp, serialized, 'utf8');
  await rename(tmp, devicesPath);
  console.log(`\n✓ Wrote ${devicesPath}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
