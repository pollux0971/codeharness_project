/**
 * STORY-019.1 — Defect intake form
 * Static source analysis. React rendering tests live in apps/web/src/defectIntake.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'DefectIntake.tsx'), 'utf8');

describe('defect-form', () => {
  it('ui_report_action_creates_defect', () => {
    expect(src).toContain('DefectForm');
    expect(src).toContain('onSubmit');
    expect(src).toContain('what_broke');
    expect(src).toContain('expected_behaviour');
    expect(src).toContain('actual_behaviour');
  });

  it('defect_form_disabled_until_required_fields_filled', () => {
    expect(src).toContain('disabled');
    expect(src).toContain('canSubmit');
  });

  it('defect_text_sanitized_before_submit_in_ui', () => {
    expect(src).toContain('sanitizeDefectText');
    expect(src).toContain('<>&');
    expect(src).toContain('SYSTEM:');
  });

  it('severity_field_is_select', () => {
    expect(src).toContain('<select');
    expect(src).toContain('critical');
    expect(src).toContain('high');
    expect(src).toContain('medium');
    expect(src).toContain('low');
  });

  it('report_button_present', () => {
    expect(src).toContain('Report');
    expect(src).toContain("type=\"button\"");
  });
});
