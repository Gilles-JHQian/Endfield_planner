/** Dev-only Vite plugin: writes the device editor's edits straight back to
 *  data/versions/1.2/devices.json without prompting the browser.
 *
 *  Active only via `configureServer`, which Vite never calls during a
 *  production build. The handler validates the body against
 *  data/schema/devices.schema.json before committing. Writes are atomic
 *  (write to .tmp + rename) so a failed write can never leave a corrupt
 *  catalog.
 *
 *  POST /api/dev/devices
 *    body: JSON array conforming to devices.schema.json
 *    200: { ok: true }
 *    400: { error: string } — invalid JSON or schema mismatch
 *    500: { error: string } — disk I/O failure
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Ajv ships dual CJS/ESM; importing the constructor bare matches scripts/validate-data.ts.
const AjvCtor = Ajv2020 as unknown as new (opts?: object) => InstanceType<typeof Ajv2020>;
const addFormatsFn = addFormats as unknown as (ajv: InstanceType<typeof Ajv2020>) => void;

const ROOT = fileURLToPath(new URL('..', import.meta.url));

interface Options {
  /** Bundle version directory under data/versions/. Defaults to '1.2'. */
  version?: string;
}

export function devApiPlugin(opts: Options = {}): Plugin {
  const version = opts.version ?? '1.2';
  const devicesFile = resolve(ROOT, 'data', 'versions', version, 'devices.json');
  const schemaFile = resolve(ROOT, 'data', 'schema', 'devices.schema.json');

  return {
    name: 'endfield-dev-api',
    apply: 'serve', // ensures this plugin only runs in dev
    configureServer(server) {
      server.middlewares.use('/api/dev/devices', (req, res) => {
        // Reject everything except POST.
        if (req.method !== 'POST') {
          respond(res, 405, { error: 'POST only' });
          return;
        }
        void handleWrite({ req, res, devicesFile, schemaFile });
      });
    },
  };
}

interface Args {
  req: IncomingMessage;
  res: ServerResponse;
  devicesFile: string;
  schemaFile: string;
}

async function handleWrite({ req, res, devicesFile, schemaFile }: Args): Promise<void> {
  const body = await readBody(req);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    respond(res, 400, { error: `invalid JSON: ${(err as Error).message}` });
    return;
  }
  // Validate.
  try {
    const schemaRaw = await readFile(schemaFile, 'utf8');
    const schema = JSON.parse(schemaRaw) as object;
    const ajv = new AjvCtor({ allErrors: true, strict: false });
    addFormatsFn(ajv);
    const validate = ajv.compile(schema);
    if (!validate(parsed)) {
      respond(res, 400, { error: `schema validation failed: ${ajv.errorsText(validate.errors)}` });
      return;
    }
  } catch (err) {
    respond(res, 500, { error: `schema load failed: ${(err as Error).message}` });
    return;
  }
  // Atomic write.
  try {
    const tmp = `${devicesFile}.tmp`;
    await writeFile(tmp, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    await rename(tmp, devicesFile);
    respond(res, 200, { ok: true });
  } catch (err) {
    respond(res, 500, { error: `write failed: ${(err as Error).message}` });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveCb, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolveCb(body));
    req.on('error', reject);
  });
}

function respond(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
