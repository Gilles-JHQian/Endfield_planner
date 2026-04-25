import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App.tsx';

describe('ui test environment', () => {
  it('renders the App in jsdom', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Endfield Planner/i })).toBeInTheDocument();
  });
});
