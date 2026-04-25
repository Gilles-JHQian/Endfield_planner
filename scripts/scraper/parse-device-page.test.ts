import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDevicePage } from './parse-device-page.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(__dirname, '..', '..', 'tests', 'fixtures', 'end-wiki', 'furnance-1.html');

describe('parseDevicePage', () => {
  it('parses the furnance-1 page into the schema-shaped device record', async () => {
    const html = await readFile(fixture, 'utf8');
    const device = parseDevicePage(html, 'furnance-1');

    // Field values per the captured page (cross-checked against
    // RESEARCH_FINDINGS.md §A.1).
    expect(device.id).toBe('furnance-1');
    expect(device.display_name_zh_hans).toBe('精炼炉');
    expect(device.category).toBe('basic_production');
    expect(device.requires_power).toBe(true);
    expect(device.power_draw).toBe(5);
    expect(device.bandwidth).toBe(2);
    expect(device.has_fluid_interface).toBe(false);
    // 占地面积 was 3×3×4; depth (visual indicator) is dropped.
    expect(device.footprint).toEqual({ width: 3, height: 3 });
    // Fields the device editor (Phase 2) will populate.
    expect(device.io_ports).toEqual([]);
    expect(device.tech_prereq).toEqual([]);
    expect(device.recipes).toEqual([]);
  });
});
