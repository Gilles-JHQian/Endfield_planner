/** Smoke tests for the design-token components. We don't assert on
 *  Tailwind class strings (those churn) — just on rendering, accessibility
 *  affordances, and the few semantic states that drive behavior.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge, Button, Card, KvRow, Pill, RailItem, SectionHead, WarningStripe } from './index.ts';

describe('Button', () => {
  it('renders children and fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Solve</Button>);
    const btn = screen.getByRole('button', { name: 'Solve' });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
  });
});

describe('Pill', () => {
  it('shows label and value', () => {
    render(<Pill label="VER">v1.2</Pill>);
    expect(screen.getByText('VER')).toBeInTheDocument();
    expect(screen.getByText('v1.2')).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('renders severity text', () => {
    render(<Badge severity="err">ERR</Badge>);
    expect(screen.getByText('ERR')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children and is keyboard-focusable when clickable', () => {
    render(
      <Card onClick={() => undefined}>
        <span>furnance-1</span>
      </Card>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('furnance-1')).toBeInTheDocument();
  });

  it('omits role when not clickable', () => {
    render(
      <Card>
        <span>static</span>
      </Card>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('KvRow', () => {
  it('renders label and value', () => {
    render(<KvRow label="功率">25 kW</KvRow>);
    expect(screen.getByText('功率')).toBeInTheDocument();
    expect(screen.getByText('25 kW')).toBeInTheDocument();
  });
});

describe('RailItem', () => {
  it('reflects active via aria-pressed', () => {
    const { rerender } = render(<RailItem icon={<span>i</span>} label="基础" />);
    expect(screen.getByRole('button', { name: /基础/ })).toHaveAttribute('aria-pressed', 'false');
    rerender(<RailItem icon={<span>i</span>} label="基础" active />);
    expect(screen.getByRole('button', { name: /基础/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<RailItem icon={<span>i</span>} label="基础" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('SectionHead', () => {
  it('shows EN + CN titles and toggles', async () => {
    const onToggle = vi.fn();
    render(<SectionHead titleEn="PROPERTIES" titleCn="属性" onToggle={onToggle} />);
    expect(screen.getByText('PROPERTIES')).toBeInTheDocument();
    expect(screen.getByText('属性')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('WarningStripe', () => {
  it('renders an aria-hidden decorative element', () => {
    const { container } = render(<WarningStripe />);
    const stripe = container.firstChild as HTMLElement | null;
    expect(stripe).not.toBeNull();
    expect(stripe?.getAttribute('aria-hidden')).toBe('true');
  });
});
