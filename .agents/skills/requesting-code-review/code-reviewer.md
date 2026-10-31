# Code Review Template

Review the changes between `{BASE_SHA}` and `{HEAD_SHA}` against the requirements: `{PLAN_OR_REQUIREMENTS}`.

## Scope of Review
- Summary of changes: `{DESCRIPTION}`
- Modified files and git diff

## Review Checklist
1. **Functional Correctness:** Are there any logical errors, edge case failures, or regression risks?
2. **SISPA Business Logic:** Are inventory transaction models, stock balances, status values, and currency calculations preserved and respected?
3. **Security:** Are secrets, tokens, or environment files guarded? Are API boundaries validated?
4. **Code Quality:** Is the code clean, modular, and free of unnecessary complexity or duplication?
5. **Testing:** Are there tests for all new behaviors, edge cases, and invalid inputs?
6. **UI/UX & Accessibility:** Are interfaces scannable, mobile-responsive, accessible (44px touch targets), and clear?
7. **Scope Discipline:** Are all changes strictly confined to the approved scope?

## Output Format

### Strengths
- [Key positives about the implementation]

### Issues
- **Critical (Must Fix):**
  - [Issue description, file path, line numbers, and required remedy]
- **Important (Should Fix):**
  - [Issue description, file path, line numbers, and recommended remedy]
- **Minor (Nice to Have):**
  - [Issue description and suggested polish]

### Assessment
- **Ready to Sync / Merge:** [Yes | No | With fixes]
- **Reasoning:** [1-2 sentences technical summary]
