# SISPA — AI Development Instructions

## 1. Project Context

SISPA is a Smart Stock & Buying Assistant designed primarily for building-material distributors and wholesalers.

The application helps businesses:
- Track inventory and stock movements.
- Identify products that need replenishment.
- Estimate stock depletion using sales history.
- Generate practical purchase recommendations.
- Manage suppliers and purchasing information.

The interface should be simple enough for non-technical business owners and shop employees.

## 2. Core Development Principles

### Understand Before Implementing
- Inspect the existing codebase before changing anything.
- Understand the relevant components, dependencies, data flow and database structure.
- Identify existing functionality that could be affected.
- Never assume a feature is missing without checking.

### Plan Before Coding
For substantial features:
1. Restate the problem.
2. Identify affected users and workflows.
3. Define inputs, processes, outputs and constraints.
4. Identify edge cases and failure conditions.
5. Propose an implementation plan.
6. Wait for approval before major architectural changes.

Do not over-engineer simple features.

### Preserve Existing Functionality
- Avoid unnecessary rewrites.
- Prefer small, focused changes.
- Do not remove existing functionality without explicit approval.
- Do not introduce dependencies without explaining their purpose.
- Follow existing project conventions unless there is a compelling reason to change them.

## 3. Development Workflows & Skill Routing

Superpowers skills are stored in `.agents/skills/` to provide rigorous, repeatable engineering discipline. Before responding to substantial development requests, inspect the available skills and read the complete `SKILL.md` relevant to the task. Never claim to have used a skill without actually reading and following its instructions.

### 3.1 Skill Discovery & Inventory
The project includes the following authoritative skill guides:
- `.agents/skills/brainstorming/SKILL.md` — Explores requirements, investigates existing code, develops alternative approaches, presents design, and enforces the design approval hard-gate before building.
- `.agents/skills/writing-plans/SKILL.md` — Produces granular, unambiguous, test-driven implementation plans saved to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.
- `.agents/skills/test-driven-development/SKILL.md` — Enforces RED-GREEN-REFACTOR cycle with no production code written before a failing test.
- `.agents/skills/systematic-debugging/SKILL.md` — Governs root cause investigation across 4 distinct phases before proposing or attempting any fix.
- `.agents/skills/verification-before-completion/SKILL.md` — Enforces the Iron Law: no completion, success, or satisfaction claims without fresh verification evidence.
- `.agents/skills/requesting-code-review/SKILL.md` — Enforces systematic code review (evaluating bugs, SISPA inventory/financial rules, security, simplicity, tests, UI/UX, and scope discipline) after verification and prior to GitHub synchronization.

### 3.2 Workflow Routing

#### A. New Feature or Significant Functionality
1. **Brainstorming:** Inspect the codebase first ("look before you ask"). Echo the user's intent. Ask Socratic, one-at-a-time questions to explore requirements and constraints.
2. **Design Approval (<HARD-GATE>):** Present alternative architectural approaches with trade-offs in a standalone message. Once an approach is selected, write the design doc (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`). Obtain explicit user approval before touching code.
3. **Writing Plans:** Break the approved design into bite-sized, independently testable tasks with exact file paths, signatures, test definitions, and verification commands.
4. **Test-Driven Development (TDD):** Execute tasks via the RED-GREEN-REFACTOR cycle. Write the failing test first, verify failure, implement minimal code to pass, and verify green.
5. **Implementation:** Keep changes focused and self-contained; adhere strictly to established architectural boundaries.
6. **Verification Before Completion:** Execute the full test suite (`npm test`), type check (`tsc --noEmit`), linter (`npm run lint`), and build (`npm run build` or `compile_applet`). Present raw evidence before claiming completion.
7. **Code Review:** Execute `.agents/skills/requesting-code-review/SKILL.md` to evaluate changes against functional correctness, SISPA inventory and financial business rules, security/secrets, code simplicity, tests, UI/UX accessibility, and scope discipline before GitHub synchronization.

#### B. Bug or Unexpected Behaviour
1. **Systematic Debugging:** Complete Phase 1 (Root Cause Investigation) before proposing any fix: read errors carefully, reproduce consistently, inspect recent changes, trace data flow from origin, and add boundary diagnostics if needed.
2. **Establish Root Cause:** Form a clear hypothesis and verify it minimally. Never apply symptom patches. If 3 or more fix attempts fail, stop and question the underlying architecture.
3. **TDD Regression Test:** Write a failing test reproducing the exact failure mode. Verify it fails for the expected reason.
4. **Implement Fix:** Write minimal code to turn the test green without side effects or unrequested refactoring.
5. **Verification Before Completion:** Run the full test suite and verify no regressions exist before claiming the bug is resolved.
6. **Code Review:** Audit the fix and surrounding data flow using `.agents/skills/requesting-code-review/SKILL.md` before synchronizing.

#### C. Refactoring
1. **Inspect Architecture & Behaviour:** Map components, dependencies, database queries, and current behaviour.
2. **Implementation Plan:** Create a structured plan for substantial refactoring tasks before modifying code.
3. **TDD Protection:** Ensure comprehensive test coverage exists for all existing behaviour before touching code.
4. **Incremental Refactoring:** Refactor in small, distinct steps while keeping the test suite continuously green.
5. **Verification:** Confirm all existing tests pass, system builds cleanly, and performance/behavioral invariants hold.
6. **Code Review:** Review refactored changes for behavioral invariance, preservation of SISPA rules, and structural clarity prior to synchronization.

#### D. Small, Straightforward Changes
Use a proportionate, lightweight workflow (e.g. clear bug with known one-line fix, typo, or minor styling tweak). Do not introduce unnecessary planning overhead, but always verify and review before claiming completion or synchronizing.

### 3.3 Mandatory Behavioural Rules
- **No Early Implementation:** Do not write production code, scaffolding, or install packages before design approval on substantial tasks.
- **No Skipping Plans:** Do not bypass implementation planning for multi-step tasks.
- **Strict TDD:** Follow RED → GREEN → REFACTOR. No production code without a failing test first.
- **No Speculative Fixes:** Always investigate and establish the root cause before proposing or attempting bug fixes.
- **Evidence Before Claims:** The Iron Law of verification applies unconditionally: run verification commands freshly and report exact evidence before claiming success. Never fabricate test results or extrapolate from partial checks.
- **Transparent Execution:** Never silently skip a workflow step. Explicitly explain when a step cannot be performed and provide the reason and chosen alternative.

### 3.4 Google AI Studio Environment Adaptations & Limitations
When executing workflows in this Google AI Studio environment, recognize the actual platform capabilities:
- **No Gemini CLI Extensions:** Tooling runs in a standard Linux/Node.js container; do not call external or unsupported CLI wrappers.
- **Single-Agent In-Session Execution:** Subagent dispatch tools are not available. Use native in-session execution (`executing-plans`) and perform builder/reviewer checks directly within the active session.
- **In-Session Code Review:** Subagent dispatch (`requesting-code-review`) is adapted to rigorous in-session review where the agent reviews the git diff against the explicit review checklist before synchronization.
- **Direct Workspace / Branch Execution:** Git worktree tooling (`using-git-worktrees`) is not supported. Work directly within the repository workspace, preserving uncommitted user changes and maintaining clean commit boundaries.
- **Interactive Tool Discipline:** Use the available system tools (`view_file`, `write_to_file`, `replace_file_content`, `run_command`, `compile_applet`, `lint_applet`) deterministically.


## 4. SISPA Business Logic and Data Integrity

These rules are mandatory.

### Inventory Records
Inventory movements should be represented by explicit transaction types:
- OPENING_BALANCE
- SALE
- RECEIPT
- ADJUSTMENT

Preserve transaction history. Do not silently overwrite historical movements.

### Stock Calculations
- Stock balances must be calculated from valid inventory movements or the established authoritative stock model.
- Never invent missing quantities or sales history.
- Handle negative stock explicitly.
- Distinguish zero stock from missing or unavailable data.

### Stock Status
Use the established SISPA status categories:
- BUY NOW
- CHECK SOON
- OK
- NO_DATA

Do not change their business definitions without approval.

### Buying Recommendations
- Recommendations must be traceable to actual inventory and sales data.
- Make assumptions visible.
- Distinguish calculated values from estimates.
- Never silently create purchase orders or modify inventory records.

### Financial Integrity
- Handle currency values and calculations carefully.
- Avoid floating-point errors in financial calculations where appropriate.
- Never fabricate supplier prices, purchase costs or transaction values.

AI may assist with explanations and analysis, but deterministic application logic remains authoritative for inventory and financial calculations.

## 5. UI/UX Standards

Design for building-material distributors and their employees.

Priorities:
- Users should identify products requiring attention within approximately five seconds of opening the dashboard.
- Keep common operations easy to discover.
- Minimise unnecessary data entry and calculations.
- Use clear labels rather than unexplained technical terminology.
- Maintain visual consistency across pages.
- Design mobile-first and ensure desktop layouts remain effective.
- Provide useful loading, empty, success and error states.
- Ensure adequate contrast, keyboard accessibility and readable typography.

Before implementing a significant interface change, consider:
- User goal
- Information hierarchy
- Interaction flow
- Error prevention
- Mobile usability
- Accessibility

Do not prioritise visual decoration over operational clarity.

## 6. Code Quality and Architecture

- Use the existing framework and architecture.
- Keep components focused and reusable.
- Separate presentation from business logic.
- Validate inputs at appropriate boundaries.
- Handle asynchronous operations and errors explicitly.
- Avoid duplicated business logic.
- Protect sensitive information and API keys.
- Never expose server-side secrets in client-side code.
- Follow existing database access and authentication security patterns.

Do not introduce architectural complexity without a demonstrated need.

## 7. Testing and Verification

For every meaningful change:
- Test the expected behaviour.
- Test relevant edge cases.
- Check affected existing functionality.
- Test business-critical calculations independently.
- Check responsive behaviour for interface changes.
- Run available linting, type checking and build commands where appropriate.

Never claim that a feature works or that tests pass unless verification was actually performed.

If a test cannot be run, state why.

## 8. Debugging

When investigating bugs:
1. Reproduce the issue where possible.
2. Identify the root cause.
3. Inspect related code and data flow.
4. Explain the cause.
5. Implement the smallest reliable fix.
6. Verify the fix and check for regressions.

Avoid speculative changes and unrelated refactoring.

## 9. Git and GitHub Practices

Google AI Studio is the primary development environment. GitHub is used for version control, backup and collaboration.

- Preserve a clean and understandable change history.
- Review changes before committing or synchronising (`requesting-code-review`).
- Never overwrite a known-good version without checking the diff.
- Do not commit API keys, passwords, credentials or `.env` files.
- Keep `.env.example` updated when new environment variables are required.
- Use descriptive commit messages.
- Do not assume a Git operation succeeded without checking its result.

## 10. Communication and Reporting

Before substantial implementation, explain the proposed approach and important trade-offs.

After implementation, report:
- What changed.
- Which files were affected.
- How the change was verified.
- Any known limitations.
- Any remaining tasks.

Be direct and technically precise. Do not claim completion prematurely.

## 11. Important Restrictions

- Do not fabricate project structure, dependencies, database schemas or API behaviour.
- Do not make destructive database changes without explicit approval.
- Do not alter authentication, permissions or security policies casually.
- Do not use mock data as if it were real business data.
- Do not replace working functionality merely to simplify implementation.
- Ask for clarification when an unresolved requirement could materially affect the implementation.