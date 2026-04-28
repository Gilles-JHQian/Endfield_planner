import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSchematicsForTest,
  importSchematicJson,
  readSchematics,
  removeSchematic,
  saveSchematic,
} from './schematics.ts';
import type { ClipboardPayload } from './clipboard.ts';

const samplePayload: ClipboardPayload = {
  origin: { x: 0, y: 0 },
  items: [
    { device_id: 'furnance-1', rel_position: { x: 0, y: 0 }, rotation: 0, recipe_id: null },
  ],
  links: [],
};

describe('schematics store', () => {
  afterEach(() => clearSchematicsForTest());

  it('saveSchematic prepends most-recent first', () => {
    saveSchematic('first', samplePayload);
    saveSchematic('second', samplePayload);
    const list = readSchematics();
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe('second');
    expect(list[1]!.name).toBe('first');
  });

  it('saveSchematic returns the entry with id and timestamp', () => {
    const entry = saveSchematic('a', samplePayload);
    expect(entry.id).toMatch(/.+/);
    expect(entry.saved_at).toBeGreaterThan(0);
    expect(entry.payload).toBe(samplePayload);
  });

  it('removeSchematic drops the entry by id', () => {
    const a = saveSchematic('a', samplePayload);
    saveSchematic('b', samplePayload);
    removeSchematic(a.id);
    const list = readSchematics();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('b');
  });

  it('importSchematicJson accepts a bare ClipboardPayload', () => {
    const entry = importSchematicJson(samplePayload, 'fallback.json');
    expect(entry.name).toBe('fallback.json');
    expect(entry.payload.items).toHaveLength(1);
  });

  it('importSchematicJson uses inner name when wrapped { name, payload }', () => {
    const wrapped = { name: 'production-line-A', payload: samplePayload };
    const entry = importSchematicJson(wrapped, 'fallback.json');
    expect(entry.name).toBe('production-line-A');
    expect(entry.payload).toEqual(samplePayload);
  });

  it('importSchematicJson rejects garbage JSON', () => {
    expect(() => importSchematicJson('hello', 'x')).toThrow();
    expect(() => importSchematicJson({ items: [] }, 'x')).toThrow(/origin/);
    expect(() => importSchematicJson({ origin: { x: 0, y: 0 } }, 'x')).toThrow(/items/);
  });
});
