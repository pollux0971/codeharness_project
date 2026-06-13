/**
 * @codeharness/shared — shared TypeScript types and basic validation helpers.
 * Owner: STORY-001.2.
 * These types are the canonical source of truth; downstream packages import from here.
 */
export function ok() { return { ok: true, issues: [] }; }
export function fail(issues) {
    return { ok: false, issues: [...issues].sort((a, b) => a.code.localeCompare(b.code)) };
}
// ── ID format validators ──────────────────────────────────────────────────────
const STORY_ID_RE = /^STORY-\d+\.\d+$/;
const EPIC_ID_RE = /^EPIC-\d+$/;
export function isValidStoryId(id) { return STORY_ID_RE.test(id); }
export function isValidEpicId(id) { return EPIC_ID_RE.test(id); }
export function validateStoryId(id) {
    return isValidStoryId(id)
        ? ok()
        : fail([{ code: 'INVALID_STORY_ID', message: `Story ID must match STORY-NNN.N, got: ${id}` }]);
}
export function validateEpicId(id) {
    return isValidEpicId(id)
        ? ok()
        : fail([{ code: 'INVALID_EPIC_ID', message: `Epic ID must match EPIC-NNN, got: ${id}` }]);
}
// ── trace event types ─────────────────────────────────────────────────────────
export const KNOWN_TRACE_EVENT_TYPES = [
    'idea_event', 'planning_event', 'context_packet_event', 'agent_output_event',
    'tool_request_event', 'permission_decision_event', 'execution_event',
    'validation_event', 'approval_event', 'promotion_event', 'rollback_event',
    // New in 025.1:
    'reasoning_event', 'tool_call_event', 'dispatch_event',
    'gateway_event', 'validator_event', 'workspace_event', 'story_manager_event',
];
export function isKnownEventType(type) {
    return KNOWN_TRACE_EVENT_TYPES.includes(type);
}
/** Validate a StoryContract object — collects ALL errors, not just first. */
export function validateStoryContract(c) {
    const issues = [];
    const req = (k) => {
        if (c[k] === undefined || c[k] === null || c[k] === '')
            issues.push({ code: `MISSING_${String(k).toUpperCase()}`, message: `missing required field: ${String(k)}` });
    };
    req('contract_id');
    req('story_id');
    req('epic_id');
    req('objective');
    req('rollback_notes');
    req('contract_issued_at');
    if (c.story_id && !isValidStoryId(c.story_id))
        issues.push({ code: 'INVALID_STORY_ID', message: `invalid story_id: ${c.story_id}` });
    if (c.epic_id && !isValidEpicId(c.epic_id))
        issues.push({ code: 'INVALID_EPIC_ID', message: `invalid epic_id: ${c.epic_id}` });
    if (!Array.isArray(c.allowed_write_set) || c.allowed_write_set.length === 0)
        issues.push({ code: 'EMPTY_ALLOWED_WRITE_SET', message: 'allowed_write_set must be a non-empty array' });
    if (!Array.isArray(c.acceptance_criteria) || c.acceptance_criteria.length === 0)
        issues.push({ code: 'EMPTY_ACCEPTANCE_CRITERIA', message: 'acceptance_criteria must be a non-empty array' });
    if (!Array.isArray(c.validation_commands) || c.validation_commands.length === 0)
        issues.push({ code: 'EMPTY_VALIDATION_COMMANDS', message: 'validation_commands must be a non-empty array' });
    if (issues.length === 0)
        return ok();
    return { ok: false, issues: issues.sort((a, b) => a.code.localeCompare(b.code)) };
}
//# sourceMappingURL=index.js.map