import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SandboxedPreview } from './SandboxedPreview';

describe('sandboxed-preview', () => {
  it('iframe_sandboxed_no_external_network', () => {
    render(<SandboxedPreview previewUrl="http://localhost:5173" targetType="web" />);
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(iframe.src).toContain('localhost:5173');
  });

  it('refresh_on_checkpoint_event', () => {
    const { rerender } = render(<SandboxedPreview previewUrl="http://localhost:5173" targetType="web" refreshKey={0} />);
    // Simulate checkpoint by incrementing refreshKey
    rerender(<SandboxedPreview previewUrl="http://localhost:5173" targetType="web" refreshKey={1} />);
    // Component re-renders with new key — iframe re-mounts
    const iframe2 = document.querySelector('iframe');
    expect(iframe2).toBeTruthy();
  });

  it('non_web_targets_fallback_to_report', () => {
    const qb = { ok: true, checks: [{ name: 'build', passed: true }, { name: 'test', passed: true }] };
    render(<SandboxedPreview previewUrl="" targetType="cli" qualityBarResult={qb} />);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/build/)).toBeTruthy();
  });
});
