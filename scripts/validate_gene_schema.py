#!/usr/bin/env python3
"""Validate all gene fields per STORY-027.3 rules."""
import json
import sys

VALID_SYMPTOM_CLASSIFICATIONS = {
    "assertion_mismatch",
    "type_error",
    "build_failure",
    "runtime_crash",
    "timeout",
    "scope_violation",
    "unknown",
}


def validate_gene(gene: dict) -> list[str]:
    errors = []
    if gene.get("emitted_by") not in ("debugger", None):
        errors.append("only debugger may emit genes")
    if gene.get("emitted_after_validator_failure") is False:
        errors.append("gene must be emitted after validator failure")
    if gene.get("regression_count", 0) >= 2:
        qs = gene.get("quarantine_status") or {}
        if not qs.get("quarantined"):
            errors.append("gene with regression_count >= 2 must be quarantined")
    sc = gene.get("symptom_classification")
    if sc and sc not in VALID_SYMPTOM_CLASSIFICATIONS:
        errors.append(f"bad symptom_classification: {sc}")
    return errors


if __name__ == "__main__":
    gene = json.load(sys.stdin)
    errors = validate_gene(gene)
    if errors:
        print("INVALID:", errors)
        sys.exit(1)
    print("OK")
