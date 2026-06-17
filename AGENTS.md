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
- Do not run full test suites unless the user asks or the change clearly affects shared behavior.
- Do not refactor outside the requested scope.
- Do not create a new brand or rename the product unless the user explicitly asks.
- Do not commit or push unless the user explicitly asks.
- Use Vietnamese for direct user-facing conversation by default unless the user asks for another language.

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
