import { describe, expect, it } from 'vitest';

describe('core test environment', () => {
  it('runs in node and has no DOM globals', () => {
    expect(typeof globalThis).toBe('object');
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });
});
