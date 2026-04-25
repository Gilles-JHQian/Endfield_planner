import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(__dirname, '..');
export const schemaDir = resolve(repoRoot, 'data', 'schema');
export const versionsDir = resolve(repoRoot, 'data', 'versions');

// Maps each data file basename to its schema file basename.
export const FILE_TO_SCHEMA: Readonly<Record<string, string>> = {
  'devices.json': 'devices.schema.json',
  'recipes.json': 'recipes.schema.json',
  'items.json': 'items.schema.json',
  'regions.json': 'regions.schema.json',
  'crossing_rules.json': 'crossing_rules.schema.json',
  'tech_tree.json': 'tech_tree.schema.json',
};

// generated.meta.json is a free-form scraper output marker, not validated.
const IGNORED_FILES = new Set(['generated.meta.json']);

export interface Failure {
  file: string;
  schema: string;
  errors: string;
}

async function readJson<T = unknown>(file: string): Promise<T> {
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as T;
}

async function buildAjv(): Promise<Ajv2020> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schemaFile of Object.values(FILE_TO_SCHEMA)) {
    const schema = await readJson<AnySchema>(resolve(schemaDir, schemaFile));
    ajv.addSchema(schema, schemaFile);
  }
  return ajv;
}

export async function listDataVersions(): Promise<string[]> {
  try {
    const entries = await readdir(versionsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
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

export interface ValidationReport {
  version: string;
  failures: Failure[];
}

export async function validateAllVersions(): Promise<ValidationReport[]> {
  const ajv = await buildAjv();
  const versions = await listDataVersions();
  const reports: ValidationReport[] = [];
  for (const version of versions) {
    reports.push({ version, failures: await validateVersion(ajv, version) });
  }
  return reports;
}

async function main(): Promise<void> {
  const reports = await validateAllVersions();
  if (reports.length === 0) {
    console.log('No data versions found under data/versions/. Nothing to validate.');
    return;
  }

  let totalFailures = 0;
  for (const report of reports) {
    if (report.failures.length === 0) {
      console.log(`✓ ${report.version}`);
    } else {
      totalFailures += report.failures.length;
      for (const f of report.failures) {
        console.error(`✗ ${f.file} (against ${f.schema})\n  ${f.errors}`);
      }
    }
  }

  if (totalFailures > 0) {
    console.error(`\n${totalFailures} validation failure(s).`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
