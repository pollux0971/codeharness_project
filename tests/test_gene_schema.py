import json
import subprocess
import sys
from pathlib import Path

SCHEMA = Path("codeharness/specs/failure_gene.schema.json")
VALIDATOR = Path("codeharness/scripts/validate_gene_schema.py")

base_gene = {
    "id": "g1",
    "matching_signal": "src:calc|type:runtime_error",
    "summary": "crash on zero",
    "strategy": "guard divide",
    "avoid": "NEVER divide without checking zero",
    "failure_type": "runtime_error",
    "repair_operator": "REBIND",
    "story_id": "STORY-X",
    "skill_id": None,
    "severity": "recoverable",
    "version": 1,
    "created_at": "2026-01-01T00:00:00Z",
    "consolidated_count": 1,
    "resolved_at": None,
    "status": "active",
    "emitted_by": "debugger",
    "emitted_after_validator_failure": True,
    "symptom_classification": "runtime_crash",
    "regression_count": 0,
    "quarantine_status": None,
}


def run_validator(gene: dict) -> tuple[bool, str]:
    r = subprocess.run(
        [sys.executable, str(VALIDATOR)],
        input=json.dumps(gene),
        capture_output=True,
        text=True,
    )
    return r.returncode == 0, r.stdout + r.stderr


def test_only_debugger_can_emit_gene():
    bad = {**base_gene, "emitted_by": "supervisor"}
    ok, out = run_validator(bad)
    assert not ok, f"Should fail: {out}"


def test_gene_must_reference_story_test_and_symptom():
    assert base_gene["story_id"]
    assert base_gene["symptom_classification"]
    ok, out = run_validator(base_gene)
    assert ok, f"Valid gene failed: {out}"


def test_quarantine_mechanism_exists():
    quarantined = {
        **base_gene,
        "regression_count": 2,
        "quarantine_status": {
            "quarantined": True,
            "quarantine_reason": "regressed test-B",
            "quarantined_at": "2026-01-01T00:00:00Z",
            "revalidation_required_by": "human",
        },
    }
    ok, out = run_validator(quarantined)
    assert ok, f"Quarantined gene should be valid: {out}"


def test_quarantined_gene_not_preloaded():
    bad = {**base_gene, "regression_count": 2, "quarantine_status": None}
    ok, out = run_validator(bad)
    assert not ok, f"Should require quarantine: {out}"


def test_human_or_passing_story_can_revalidate():
    for revalidator in ("human", "passing_story"):
        g = {
            **base_gene,
            "regression_count": 2,
            "quarantine_status": {
                "quarantined": True,
                "quarantine_reason": "x",
                "quarantined_at": "2026-01-01T00:00:00Z",
                "revalidation_required_by": revalidator,
            },
        }
        ok, _ = run_validator(g)
        assert ok, f"revalidation_required_by={revalidator} should be valid"
