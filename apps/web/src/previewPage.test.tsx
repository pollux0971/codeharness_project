import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewPage } from './PreviewPage';

describe('preview-page', () => {
  it('state_no_frontend_stage_rendered', () => {
    render(<PreviewPage hasFrontendStage={false} />);
    expect(screen.getByText(/並無前端開發階段|no frontend stage/i)).toBeTruthy();
    expect(document.querySelector('[data-preview-state="no_frontend_stage"]')).toBeTruthy();
  });

  it('state_not_yet_reached_names_delivering_story', () => {
    render(<PreviewPage hasFrontendStage={true} showcaseStoryId="STORY-SHOWCASE-001" showcaseCheckpointed={false} />);
    expect(screen.getByText(/還沒進入前端開發階段|not yet reached/i)).toBeTruthy();
    expect(screen.getByText(/STORY-SHOWCASE-001/)).toBeTruthy();
    expect(document.querySelector('[data-preview-state="not_yet_reached"]')).toBeTruthy();
  });

  it('state_live_with_device_viewports', () => {
    render(<PreviewPage hasFrontendStage={true} showcaseStoryId="STORY-SHOWCASE-001"
      showcaseCheckpointed={true} previewUrl="http://localhost:5173" viewport="desktop" />);
    expect(document.querySelector('[data-preview-state="live"]')).toBeTruthy();
    expect(document.querySelector('iframe')).toBeTruthy();
    expect(screen.getByRole('button', { name: /mobile/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /tablet/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /desktop/i })).toBeTruthy();
  });

  it('state_driven_by_trace_not_ui', () => {
    const onViewport = vi.fn();
    render(<PreviewPage hasFrontendStage={true} showcaseStoryId="S-1"
      showcaseCheckpointed={true} previewUrl="http://localhost:5173"
      viewport="desktop" onViewportChange={onViewport} />);
    fireEvent.click(screen.getByRole('button', { name: /mobile/i }));
    expect(onViewport).toHaveBeenCalledWith('mobile');
    // State still 'live' — only the viewport callback fired
    expect(document.querySelector('[data-preview-state="live"]')).toBeTruthy();
  });
});
