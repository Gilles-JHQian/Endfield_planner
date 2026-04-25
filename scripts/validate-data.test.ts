import { describe, expect, it } from 'vitest';
import { listDataVersions, validateAllVersions } from './validate-data.ts';

describe('validate-data', () => {
  it('finds at least one bundled data version', async () => {
    const versions = await listDataVersions();
    expect(versions.length).toBeGreaterThan(0);
  });

  it('every bundled data version passes its schemas', async () => {
    const reports = await validateAllVersions();
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      expect(
        report.failures,
        `version ${report.version} should validate cleanly:\n${report.failures
          .map((f) => `  ${f.file}: ${f.errors}`)
          .join('\n')}`,
      ).toEqual([]);
    }
  });
});
