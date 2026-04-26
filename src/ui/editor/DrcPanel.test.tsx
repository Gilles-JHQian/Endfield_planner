import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { DrcPanel } from './DrcPanel.tsx';
import type { DrcReport, Issue } from '@core/drc/index.ts';

const errorIssue: Issue = {
  rule_id: 'REGION_001',
  severity: 'error',
  message_zh_hans: '设备越界',
  message_en: 'Device out of bounds',
  cells: [{ x: 5, y: 5 }],
  device_instance_id: 'd-1',
};

function renderWith(report: DrcReport, onClick = vi.fn()) {
  return {
    onClick,
    ...render(
      <I18nProvider>
        <DrcPanel report={report} onIssueClick={onClick} />
      </I18nProvider>,
    ),
  };
}

describe('DrcPanel', () => {
  it('shows the clean state when there are no issues', () => {
    renderWith({ issues: [], skipped: [] });
    expect(screen.getByText(/无违规|No violations/i)).toBeInTheDocument();
  });

  it('shows severity counts when issues are present', () => {
    renderWith({ issues: [errorIssue], skipped: [] });
    // Counts row uses split spans; check by combining text in the strip.
    const strip = screen.getByRole('button', { name: /DRC/i });
    expect(strip.textContent).toContain('1');
  });

  it('expands and lists issue rule ids; clicking calls back with the issue', async () => {
    const { onClick } = renderWith({ issues: [errorIssue], skipped: [] });
    await userEvent.click(screen.getByRole('button', { name: /DRC/i }));
    expect(screen.getByText('REGION_001')).toBeInTheDocument();
    await userEvent.click(screen.getByText('REGION_001'));
    expect(onClick).toHaveBeenCalledWith(errorIssue);
  });

  it('shows the skipped-rules drawer when rules are dormant', async () => {
    renderWith({
      issues: [],
      skipped: [{ rule_id: 'POWER_002', missing: ['power_supply'] }],
    });
    await userEvent.click(screen.getByRole('button', { name: /DRC/i }));
    expect(screen.getByText('POWER_002')).toBeInTheDocument();
    expect(screen.getByText(/missing: power_supply/)).toBeInTheDocument();
  });
});
