# ExoJS documentation site authoring rules

Applies to `site/` Astro pages/components and React islands. The repository's root `AGENTS.md` still applies.

- Prefer semantic HTML: native `button` for actions and `a href` for navigation. Do not make a clickable `div` or `span` unless there is an explicit accessible interaction contract.
- Give informative images meaningful `alt` text and decorative images `alt=""`. Ensure form inputs have associated labels and interactive elements have a keyboard path, visible focus and correct ARIA states.
- Keep accessible names for links, controls, frames and media. Avoid positive `tabindex`, unnecessary ARIA overrides, and hover-only or pointer-only interactions.
- Prefer Astro's `class:list` directive for conditional classes rather than complex manual string concatenation. This is an authoring preference, not a correctness gate.
- Do not introduce `set:html`, bypass escaping, or inject unsanitized HTML without an explicit security review. Treat content-derived strings as untrusted by default.
- Keep Astro template accessibility lint enabled until a tool demonstrably checks the same template markup; Oxlint JSX accessibility checks apply to TSX but do not cover raw Astro HTML.
- Check `astro check`, lint, Stylelint, and relevant interactive/browser tests for changes. Guidance here supplements CI; it does not replace tests or deterministic accessibility checks.
