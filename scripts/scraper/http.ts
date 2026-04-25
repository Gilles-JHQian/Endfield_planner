/**
 * HTTP fetch with on-disk HTML cache and 500ms rate-limited serial queue.
 *
 * Per REQUIREMENT.md §6.2 the scraper must cache raw HTML so reruns don't
 * re-hit end.wiki, and must respect a 500ms gap between requests.
 *
 * The cache key is a sha256 of the absolute URL; cache misses fetch over
 * the rate-limited queue and then write the bytes to disk.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { request } from 'undici';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const cacheDir = resolve(__dirname, '..', '.cache');

const USER_AGENT =
  'endfield-planner-scraper/0.1 (+https://github.com/Gilles-JHQian/Endfield_planner)';
const REQUEST_GAP_MS = 500;

let lastRequestAt = 0;
let queueTail: Promise<void> = Promise.resolve();

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + REQUEST_GAP_MS - now);
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();
}

async function cachePath(url: string): Promise<string> {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  await mkdir(cacheDir, { recursive: true });
  return resolve(cacheDir, `${hash}.html`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface FetchOptions {
  /** When true, ignore the on-disk cache and always re-fetch. */
  noCache?: boolean;
}

/**
 * GET `url` and return its decoded body as a string.
 * Reads from cache when available unless `noCache` is set.
 * All fetches are serialized through a 500ms-gap queue.
 */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const file = await cachePath(url);

  if (!opts.noCache && (await fileExists(file))) {
    return readFile(file, 'utf8');
  }

  // Chain onto the queue so requests serialize globally across callers.
  const slot = queueTail.then(async () => {
    await rateLimitedDelay();
    const res = await request(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`GET ${url} -> ${res.statusCode.toString()}`);
    }
    return res.body.text();
  });
  queueTail = slot.then(
    () => undefined,
    () => undefined,
  );

  const body = await slot;
  await writeFile(file, body, 'utf8');
  return body;
}

/** Test/diagnostic helper — returns the cache path for a URL without fetching. */
export function cachePathFor(url: string): Promise<string> {
  return cachePath(url);
}
