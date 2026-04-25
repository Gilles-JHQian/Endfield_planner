import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@i18n/index.tsx';
import { SolverPanel } from './SolverPanel.tsx';

describe('SolverPanel', () => {
  it('loads the v1.2 bundle, solves a target, and renders the recipe nodes table', async () => {
    render(
      <I18nProvider>
        <SolverPanel />
      </I18nProvider>,
    );

    // Header appears once the bundle finishes loading.
    expect(
      await screen.findByRole('heading', { name: /Endfield Planner/i }, { timeout: 5000 }),
    ).toBeInTheDocument();

    // Defaults: item-iron-cmpt at 30/min. Submit the form.
    const solveButton = screen.getByRole('button', { name: /^(解算|Solve)$/ });
    const user = userEvent.setup();
    await user.click(solveButton);

    // RecipeNodes section header should show after a successful solve.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /配方节点|Recipe nodes/i })).toBeInTheDocument();
    });

    // The two-step iron chain: cmpt + nugget should both be present.
    expect(screen.getByText('recipe-iron-cmpt')).toBeInTheDocument();
    expect(screen.getByText('recipe-iron-nugget')).toBeInTheDocument();
    // Raw input is iron-ore.
    expect(screen.getByText('item-iron-ore')).toBeInTheDocument();
  });

  it('shows a validation message when rate is invalid', async () => {
    render(
      <I18nProvider>
        <SolverPanel />
      </I18nProvider>,
    );

    await screen.findByRole('heading', { name: /Endfield Planner/i }, { timeout: 5000 });

    const user = userEvent.setup();
    const rateInput = screen.getByRole('spinbutton');
    await user.clear(rateInput);
    await user.type(rateInput, '0');
    await user.click(screen.getByRole('button', { name: /^(解算|Solve)$/ }));

    expect(
      await screen.findByText(/请输入大于零的产能|Enter a rate greater than zero/),
    ).toBeInTheDocument();
  });
});
