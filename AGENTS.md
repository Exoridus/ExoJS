# AGENTS.md

Repository-wide guidance for AI coding agents (Codex, Claude Code, Gemini CLI, Cursor agents, and similar tools).

## Scope
- Applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Primary goals
- Preserve existing architecture and API behavior unless explicitly asked to change it.
- Keep changes minimal, focused, and easy to review.
- Stay compatible with both:
  - modern TypeScript checks (`npm run typecheck`)
  - declaration build on TypeScript 3.9 (`npm run build:declarations`)

## Required validation
Run these before finalizing substantial changes:
1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. `npm run build:declarations`

## Project conventions

### Language and style
- Use TypeScript for source changes.
- Use single quotes.
- Keep public classes and APIs in `StrictPascalCase`.
- Keep variables, methods, and properties in `strictCamelCase`.
- Keep private/protected fields prefixed with `_` when matching existing style.
- Prefer `Array<T>` over `T[]` to match current lint rules.
- Prefer interfaces prefixed with `I` (for new interface names).
- Do not mass-reformat unrelated files.

### Imports and paths
- Follow existing alias imports based on `baseUrl: "src"` (for example `core/Application`, `utils/math`).
- Avoid unnecessary path-style churn.

### Architecture
- Keep subsystem boundaries stable:
  - `core`, `rendering`, `math`, `input`, `audio`, `resources`, `utils`, `types`, `particles`
- Do not move files/directories unless requested.

### Behavior and compatibility
- Favor backward-compatible fixes over broad redesigns.
- If behavior is uncertain, add or update tests instead of guessing.
- Avoid introducing new dependencies unless there is clear value.

## Transform/matrix conventions
- Follow: [docs/TRANSFORM_CONVENTIONS.md](docs/TRANSFORM_CONVENTIONS.md)

## Agent workflow expectations
- Explain assumptions clearly in PR/summary notes.
- Call out deferred items explicitly (what was deferred, why, and next step).
- If you find unrelated local modifications, do not revert them automatically.
