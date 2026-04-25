/**
 * Parse a single /zh-Hans/factory/buildings/<slug>/ page into a partial Device.
 *
 * Extracts the six labeled fields end.wiki publishes consistently in a key/value
 * table: 建筑类型, 需要电力, 电力消耗, 带宽, 流体接口, 占地面积. Display name comes
 * from the page <title>. Recipes / io_ports / tech_prereq are NOT in the page
 * text — recipes get filled by the cross-reference pass; io_ports and tech_prereq
 * stay empty per §10.1 / §10.5.
 */
import { load } from 'cheerio';
import { CATEGORY_MAP, type DeviceCategory, type ScrapedDevice } from './types.ts';

interface DeviceFields {
  display_name_zh_hans: string;
  category: DeviceCategory;
  requires_power: boolean;
  power_draw: number;
  bandwidth: number;
  has_fluid_interface: boolean;
  footprint: { width: number; height: number };
}

function parseFootprint(raw: string): { width: number; height: number } {
  // 占地面积 is published as W×H or W×H×D (depth is visual-only — drop it).
  const parts = raw.split(/[×x]/).map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Cannot parse footprint "${raw}"`);
  }
  return { width: parts[0]!, height: parts[1]! };
}

function parseYesNo(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '是') return true;
  if (trimmed === '否') return false;
  throw new Error(`Cannot parse yes/no "${raw}"`);
}

function parseInteger(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`Cannot parse integer "${raw}"`);
  return n;
}

function parseCategory(raw: string): DeviceCategory {
  const mapped = CATEGORY_MAP[raw.trim()];
  if (!mapped) throw new Error(`Unknown 建筑类型 "${raw}"`);
  return mapped;
}

function parseDisplayNameFromTitle(title: string): string {
  // Title format: "<name> — 明日方舟：终末地 | 明日方舟：终末地 Wiki"
  const head = title.split('—')[0]?.trim();
  if (!head) throw new Error(`Cannot extract device name from <title> "${title}"`);
  return head;
}

export function parseDevicePage(html: string, slug: string): ScrapedDevice {
  const $ = load(html);

  const fields: Partial<DeviceFields> = {};
  $('th').each((_, el) => {
    const label = $(el).text().trim();
    const value = $(el).next('td').text();
    if (!value) return;
    switch (label) {
      case '建筑类型':
        fields.category = parseCategory(value);
        break;
      case '需要电力':
        fields.requires_power = parseYesNo(value);
        break;
      case '电力消耗':
        fields.power_draw = parseInteger(value);
        break;
      case '带宽':
        fields.bandwidth = parseInteger(value);
        break;
      case '流体接口':
        fields.has_fluid_interface = parseYesNo(value);
        break;
      case '占地面积':
        fields.footprint = parseFootprint(value);
        break;
      default:
        // Other rows (e.g. 可拆除) are ignored — they aren't in our schema.
        break;
    }
  });

  fields.display_name_zh_hans = parseDisplayNameFromTitle($('title').text());

  // Strictly required: name + category + footprint. The numeric/boolean fields
  // are optional on storage/utility/combat devices that don't consume power or
  // have a bandwidth — default those to 0 / false.
  const required: (keyof DeviceFields)[] = ['display_name_zh_hans', 'category', 'footprint'];
  for (const key of required) {
    if (fields[key] === undefined) {
      throw new Error(`Device "${slug}" page is missing required field "${key}"`);
    }
  }

  return {
    id: slug,
    display_name_zh_hans: fields.display_name_zh_hans,
    footprint: fields.footprint!,
    bandwidth: fields.bandwidth ?? 0,
    power_draw: fields.power_draw ?? 0,
    requires_power: fields.requires_power ?? false,
    has_fluid_interface: fields.has_fluid_interface ?? false,
    io_ports: [],
    tech_prereq: [],
    category: fields.category!,
    recipes: [],
  };
}
