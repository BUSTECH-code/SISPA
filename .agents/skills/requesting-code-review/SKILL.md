---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements.
---

# Requesting Code Review

## Overview

Catch bugs, regressions, security flaws, and requirement gaps before they cascade into larger issues or reach production.

**Core principle:** Review early, review often.

Reviewing code requires evaluating concrete changes against explicit requirements and quality standards, using isolated context rather than conversational assumptions.

## When to Request Review

**Mandatory:**
- After completing each task in task-driven development
- After completing a major feature
- Before synchronizing code to GitHub or merging to `main`

**Optional but Valuable:**
- When stuck (to gain a fresh, objective perspective)
- Before refactoring (as a baseline health check)
- After fixing a complex or elusive bug

## Review Criteria & Focus Areas

Every code review must systematically evaluate the changes against:

1. **Functional Bugs & Regressions:**
   - Logic flaws, off-by-one errors, boundary mistakes, unhandled edge cases, or broken existing workflows.
2. **SISPA Inventory & Financial Business-Rule Violations:**
   - Non-destructive ledger updates (never silently overwrite historical inventory records).
   - Valid transaction types (`OPENING_BALANCE`, `SALE`, `RECEIPT`, `ADJUSTMENT`).
   - Deterministic stock and price calculations (never invent quantities, costs, or sales history).
   - Authoritative status definitions (`BUY NOW`, `CHECK SOON`, `OK`, `NO_DATA`).
   - Explicit handling of negative stock and zero stock.
3. **Security Issues & Secret Exposure:**
   - Zero exposure of server-side secrets (`GEMINI_API_KEY`, passwords, private tokens) in client bundles or public repositories.
   - Proper input validation and authorization checks at API and server boundaries.
   - Verification that `.env` files or credentials are not staged or tracked.
4. **Code Quality & Simplicity:**
   - Clean separation of concerns (presentation separated from domain logic).
   - Avoidance of unnecessary architectural complexity, bloat, or premature abstraction.
   - Strict adherence to DRY and YAGNI.
5. **Test Adequacy & Coverage:**
   - Every modified or new behavior accompanied by automated tests.
   - Tests assert on real behavior, not trivial or mocked mechanics.
   - Boundary conditions, error states, and invalid inputs verified.
6. **UI/UX & Accessibility Standards:**
   - Operational clarity for store owners and employees (scannable within ~5 seconds).
   - Responsive layouts across mobile and desktop.
   - Accessible touch targets (minimum 44x44px for action buttons) and proper contrast.
   - Meaningful loading, empty, and error states.
7. **Scope Discipline:**
   - No unapproved refactoring, feature creep, or unrelated modifications outside the agreed scope.

## Severity Categories & Action Protocol

Findings must be classified into standardized severity categories:

| Severity | Definition | Action Required |
|---|---|---|
| **Critical** | Bugs, security flaws, data loss risks, financial/ledger violations, or broken core features | **Must fix immediately** before proceeding |
| **Important** | Architecture issues, test gaps, major error-handling omissions, accessibility defects | **Must fix** before merging or syncing to GitHub |
| **Minor** | Code style polish, documentation tweaks, micro-optimizations | Note down for later; does not block completion |

### Recommendation / Assessment
- **Ready to Sync / Merge:** `Yes` | `No` | `With fixes`
- **Reasoning:** Concise technical justification explaining the determination.

## How to Execute the Review

1. **Determine the Git Diff Boundaries:**
   Identify the base commit or branch and compare current changes:
   ```bash
   git diff origin/main..HEAD
   # or inspect changed files against base branch
   git status
   git diff
   ```
2. **Conduct the Systematic Review:**
   Audit all changed and created files against the 7 Review Criteria.
3. **Report and Triage Findings:**
   List all findings categorized by Critical, Important, and Minor.
4. **Remediate:**
   Address all Critical and Important items, re-verifying with the project test suite (`npm test`, `npm run typecheck`, `npm run lint`).
