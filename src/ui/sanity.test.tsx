import { describe, expect, it } from 'vitest';

describe('ui test environment', () => {
  it('runs in jsdom and exposes window/document', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
