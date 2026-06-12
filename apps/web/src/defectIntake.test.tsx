import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DefectForm } from './DefectIntake';

describe('defect-form', () => {
  it('ui_report_action_creates_defect', () => {
    const onSubmit = vi.fn();
    render(<DefectForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(/title/i),            { target: { value: 'Bug in calc' } });
    fireEvent.change(screen.getByPlaceholderText(/what broke/i),       { target: { value: 'Calc fails' } });
    fireEvent.change(screen.getByPlaceholderText(/expected/i),         { target: { value: 'Returns 4' } });
    fireEvent.change(screen.getByPlaceholderText(/actual/i),           { target: { value: 'Returns 5' } });
    fireEvent.change(screen.getByPlaceholderText(/artifact version/i), { target: { value: 'v1.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: /report/i }));
    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0].title).toBe('Bug in calc');
  });
});
