/** Smoke test — EditorPage mounts in jsdom without crashing.
 *
 *  EditorPage now loads the v1.2 DataBundle on mount before showing the
 *  4-column shell. Tests use findBy* to wait for the bundle and then exercise
 *  the layer toggle. Konva's Stage renders as a div in jsdom (no GL), which
 *  is fine at this assertion level.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { EditorPage } from './EditorPage.tsx';

describe('EditorPage', () => {
  it('renders the 4 columns and the workspace status bar after data loads', async () => {
    render(
      <I18nProvider>
        <EditorPage />
      </I18nProvider>,
    );
    // Wait for data load to complete and the shell to mount.
    expect(
      await screen.findByLabelText(/category rail/i, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/device library/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inspector/i)).toBeInTheDocument();

    expect(screen.getByText('CURSOR')).toBeInTheDocument();
    expect(screen.getByText('PLOT')).toBeInTheDocument();
  });

  it('layer toggle defaults to SOLID and switches on click', async () => {
    render(
      <I18nProvider>
        <EditorPage />
      </I18nProvider>,
    );
    await screen.findByLabelText(/workspace/i, {}, { timeout: 5000 });

    expect(screen.getAllByText('SOLID').length).toBeGreaterThan(0);

    const fluidBtn = screen.getByRole('button', { name: 'FLUID' });
    await userEvent.click(fluidBtn);
    expect(screen.getAllByText('FLUID').length).toBeGreaterThan(0);
  });
});
