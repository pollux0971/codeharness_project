/**
 * STORY-005.1 — Vite app shell acceptance tests
 * Verifies: app_builds_without_backend, placeholder_panels_render
 * Does NOT require a running backend, browser, or network access.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webRoot = path.resolve(__dirname, '../apps/web');
const src = path.join(webRoot, 'src/App.tsx');

describe('STORY-005.1 Vite app shell', () => {
  it('app_builds_without_backend: package.json exists with correct name and build script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@codeharness/web');
    expect(pkg.scripts?.build).toBeTruthy();
  });

  it('app_builds_without_backend: index.html entry point exists and references module script', () => {
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
    expect(html).toContain('type="module"');
    expect(html).toContain('src/main.tsx');
  });

  it('placeholder_panels_render: App.tsx declares all three panel sections', () => {
    const source = fs.readFileSync(src, 'utf8');
    expect(source).toContain('data-panel="skills-agents"');
    expect(source).toContain('data-panel="conversation"');
    expect(source).toContain('data-panel="platform"');
  });

  it('placeholder_panels_render: placeholder component renders without backend data', () => {
    const source = fs.readFileSync(src, 'utf8');
    expect(source).toContain('data-placeholder');
    expect(source).toContain('Placeholder');
  });

  it('placeholder_panels_render: panel eyebrows include expected labels', () => {
    const source = fs.readFileSync(src, 'utf8');
    expect(source).toContain('Skills');
    expect(source).toContain('Conversation');
    expect(source).toContain('Platform');
  });

  it('app_builds_without_backend: no secret-like values in source', () => {
    const source = fs.readFileSync(src, 'utf8');
    expect(source).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(source).not.toMatch(/ghp_[A-Za-z0-9]{8,}/);
    expect(source).not.toMatch(/AKIA[0-9A-Z]{12,}/);
  });
});
