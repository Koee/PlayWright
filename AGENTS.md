# Repository Agent Rules

This repository uses project-local agent rules. Before reading code, editing files, running tests, or reviewing changes, agents must apply these guides:

- `Agent/question-first-scope-rules.md`
- `Agent/agent-workflow-scope-guide.md`

Default operating mode:

- Ask first when the goal, scope, verification command, or forbidden actions are unclear.
- Start from the smallest reasonable scope.
- Expand only through direct imports, errors, logs, config dependency, or type dependency.
- Explain why scope is expanding before reading or editing outside the original scope.
- Use Scope Guard to avoid broad code reading.
- Use Test Selector to choose the smallest meaningful verification command.
- Store temporary agent scenarios, draft notes, review notes, and verification notes under `Agent/` unless the user explicitly requests another location.
- Store formal project implementation plans under `docs/plans/YYYY-MM-DD-<feature-name>.md` and the live task tracker at `docs/plans/task.md`; keep `task.md` concise and do not paste long logs or implementation details there.
- Do not use `docs/superpowers/plans/` unless the user explicitly asks for that default.
- Follow the repository file structure described in `Agent/agent-workflow-scope-guide.md` before creating new files or folders.
- When creating a new test script/spec intended for repeated use, update `package.json` scripts and `docs/repo-command-guide.md` with the run command, required setup, report/artifact output, and a short purpose summary.
- When adding or changing a testcase that also has k6 support, update `docs/repo-command-guide.md` in the same flow section with the related k6 command, required setup/env, report/artifact output, and whether k6 should run after the Playwright/API command.
- Do not run full test suites unless the user asks or the change clearly affects shared behavior.
- Do not refactor outside the requested scope.
- Do not create a new brand or rename the product unless the user explicitly asks.
- Do not commit or push unless the user explicitly asks.
- Use Vietnamese for direct user-facing conversation by default unless the user asks for another language.

## Superpowers Usage Override

Project-local rules in this file and the two `Agent/` guides are the default workflow for this repository.

- Do not use full `superpowers:brainstorming` for small tasks, bugfixes, reviews, explanations, config/data edits, or extensions to an existing flow.
- For small tasks, use only Question-First Scope Rules, Scope Guard, and Test Selector.
- If a Superpowers skill is available but the task is small, treat it as optional background guidance and do not run its full spec/design workflow.
- Use full `superpowers:brainstorming` only for large new work that needs design discovery, such as creating a new test script for a new feature from scratch, adding a new cross-file framework/workflow, or when the user explicitly asks for brainstorming/design.
- For extensions to an existing feature, such as adding k6 performance coverage to an existing Playwright/API test, start from the existing files and create only a short scenario or formal plan if the change crosses multiple files or carries real risk.
- Do not let Superpowers defaults create files under `docs/superpowers/*`, commit specs/plans, or add review gates unless the user explicitly asks.

## Quota Guard

- For a small task, read at most 3-5 files unless direct imports, errors, logs, config dependency, or type dependency prove more are needed.
- If more than 5 files are needed for a small task, explain why before continuing.
- If more than 8 files are needed, stop and ask the user before expanding further.
- Do not read long docs/plans/logs end to end when only one section is relevant; use `rg` or targeted section reads.
- Do not create plan files, scenario files, verification notes, or docs for analysis-only tasks or edits touching only 1-2 files unless the user asks.
- Do not create new user-facing guides/docs unless the user explicitly asks, or a new reusable test command/spec requires `docs/repo-command-guide.md` to be updated by the rules below.

## Plan And Docs Locations

- `docs/superpowers/*` is legacy in this repository. Do not create new files there unless the user explicitly asks for that exact location.
- Short agent notes, scenarios, drafts, reviews, and verification notes belong under `Agent/` only when a saved note is actually needed.
- Formal project implementation plans belong under `docs/plans/YYYY-MM-DD-<feature-name>.md`; the live tracker is `docs/plans/task.md`.
- `docs/plans/task.md` must stay concise and must not contain long logs, diffs, or implementation details.
- Do not commit any spec, plan, doc, or code unless the user explicitly asks.

For ambiguous requests, first establish:

```text
Goal:
Scope:
Do not:
Verify:
Output:
```

## Scope Guard + Test Selector Usage

Use Scope Guard when reading or editing code:

```text
Scope Guard:
- Start only from the user-provided files or the smallest likely entry point.
- Expand scope only through direct imports, error logs, stack traces, config dependency, or type dependency.
- Explain the reason before reading or editing outside the original scope.
- Ask the user before broad expansion across multiple folders.
```

Use Test Selector when verifying changes:

```text
Test Selector:
- Choose the smallest meaningful verification command.
- Prefer one related spec over the full Playwright suite.
- Prefer typecheck or file-level lint when the change is not browser-behavior related.
- Ask before running full test suites or commands with large output.
```

Recommended prompt shape:

```text
Apply AGENTS.md.
Use Scope Guard + Test Selector.

Goal:
Scope:
Do not:
Verify:
Output:
```
