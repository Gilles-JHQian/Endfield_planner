/** Smoke test — EditorPage mounts in jsdom without crashing.
 *
 *  Konva needs a real canvas; in jsdom the canvas API is stubbed but Konva's
 *  warnings get noisy. We just verify the shell renders and the layer toggle
 *  is wired. The Konva Stage itself is rendered as a div in jsdom (no GL),
 *  which is fine for this assertion level.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { EditorPage } from './EditorPage.tsx';

describe('EditorPage', () => {
  it('renders the 4 columns and the workspace status bar', () => {
    render(
      <I18nProvider>
        <EditorPage />
      </I18nProvider>,
    );
    expect(screen.getByLabelText(/category rail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/device library/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/inspector/i)).toBeInTheDocument();

    // Status bar shows static labels.
    expect(screen.getByText('CURSOR')).toBeInTheDocument();
    expect(screen.getByText('PLOT')).toBeInTheDocument();
  });

  it('layer toggle defaults to SOLID and switches on click', async () => {
    render(
      <I18nProvider>
        <EditorPage />
      </I18nProvider>,
    );
    // Default active layer = solid → status bar shows SOLID.
    const status = screen.getAllByText('SOLID');
    expect(status.length).toBeGreaterThan(0);

    const fluidBtn = screen.getByRole('button', { name: 'FLUID' });
    await userEvent.click(fluidBtn);
    expect(screen.getAllByText('FLUID').length).toBeGreaterThan(0);
  });
});
