import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const schemaDir = resolve(repoRoot, 'data', 'schema');
const versionsDir = resolve(repoRoot, 'data', 'versions');

// Maps each data file basename to its schema file basename.
const FILE_TO_SCHEMA: Readonly<Record<string, string>> = {
  'devices.json': 'devices.schema.json',
  'recipes.json': 'recipes.schema.json',
  'items.json': 'items.schema.json',
  'regions.json': 'regions.schema.json',
  'crossing_rules.json': 'crossing_rules.schema.json',
  'tech_tree.json': 'tech_tree.schema.json',
};

// generated.meta.json is a free-form scraper output marker, not validated.
const IGNORED_FILES = new Set(['generated.meta.json']);

interface Failure {
  file: string;
  schema: string;
  errors: string;
}

async function readJson<T = unknown>(file: string): Promise<T> {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

async function loadSchemas(ajv: Ajv2020): Promise<void> {
  for (const schemaFile of Object.values(FILE_TO_SCHEMA)) {
    const schema = await readJson<AnySchema>(resolve(schemaDir, schemaFile));
    ajv.addSchema(schema, schemaFile);
  }
}

async function listDataVersions(): Promise<string[]> {
  try {
    const entries = await readdir(versionsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function validateVersion(ajv: Ajv2020, version: string): Promise<Failure[]> {
  const dir = resolve(versionsDir, version);
  const files = await readdir(dir);
  const failures: Failure[] = [];

  for (const file of files) {
    if (IGNORED_FILES.has(file)) continue;
    if (!file.endsWith('.json')) continue;

    const schemaFile = FILE_TO_SCHEMA[file];
    if (!schemaFile) {
      failures.push({
        file: `${version}/${file}`,
        schema: '(none)',
        errors: 'No schema mapping for this filename. Add it to FILE_TO_SCHEMA.',
      });
      continue;
    }

    const validate = ajv.getSchema(schemaFile);
    if (!validate) {
      failures.push({
        file: `${version}/${file}`,
        schema: schemaFile,
        errors: 'Schema not loaded.',
      });
      continue;
    }

    const data = await readJson(resolve(dir, file));
    if (!validate(data)) {
      failures.push({
        file: `${version}/${file}`,
        schema: schemaFile,
        errors: ajv.errorsText(validate.errors, { separator: '\n  ' }),
      });
    }
  }

  return failures;
}

async function main(): Promise<void> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  await loadSchemas(ajv);

  const versions = await listDataVersions();
  if (versions.length === 0) {
    console.log('No data versions found under data/versions/. Nothing to validate.');
    return;
  }

  let totalFailures = 0;
  for (const version of versions) {
    const failures = await validateVersion(ajv, version);
    if (failures.length === 0) {
      console.log(`✓ ${version}`);
    } else {
      totalFailures += failures.length;
      for (const f of failures) {
        console.error(`✗ ${f.file} (against ${f.schema})\n  ${f.errors}`);
      }
    }
  }

  if (totalFailures > 0) {
    console.error(`\n${totalFailures} validation failure(s).`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
