import { describe, expect, it } from 'vitest';
import { abbreviateCnName } from './device-label.ts';

describe('abbreviateCnName', () => {
  it('returns the input unchanged when shorter than the max', () => {
    expect(abbreviateCnName('熔炉')).toBe('熔炉');
  });

  it('returns the input unchanged when exactly at the max', () => {
    expect(abbreviateCnName('熔炼炉')).toBe('熔炼炉');
  });

  it('truncates names longer than the max with an ellipsis', () => {
    expect(abbreviateCnName('息壤精炼炉')).toBe('息壤精…');
  });

  it('honors a custom max', () => {
    expect(abbreviateCnName('息壤精炼炉', 2)).toBe('息壤…');
  });

  it('counts SMP codepoints as a single char', () => {
    // 𝕏 (U+1D54F, a surrogate pair in UTF-16) should count as 1 char.
    expect(abbreviateCnName('𝕏𝕐ABC', 3)).toBe('𝕏𝕐A…');
  });
});
