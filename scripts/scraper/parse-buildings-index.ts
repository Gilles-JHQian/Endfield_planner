/**
 * Parse the /zh-Hans/factory/buildings/ index page and return every device slug.
 * Stable selector: anchor href starting with /zh-Hans/factory/buildings/<slug>/.
 */
import { load } from 'cheerio';

const SLUG_PATTERN = /^\/zh-Hans\/factory\/buildings\/([a-z0-9][a-z0-9-]*)\/?$/;

export function parseBuildingsIndex(html: string): string[] {
  const $ = load(html);
  const slugs = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const match = SLUG_PATTERN.exec(href);
    if (match?.[1]) slugs.add(match[1]);
  });
  return [...slugs].sort();
}
