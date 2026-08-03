# Repo-specific instructions

## superpowers skill output location

The `superpowers:writing-plans` and `superpowers:brainstorming` skills default to
writing plans/specs under `docs/superpowers/plans/` and `docs/superpowers/specs/`.
**Do not use that default in this repo.** Write them to `.workspace/plans/` and
`.workspace/specs/` instead.

`.workspace/` is git-ignored (blanket `.*` rule in `.gitignore`) and is where all
local planning scratch (roadmaps, reviews, specs, plans) lives. Design docs and
implementation plans are working artifacts for the current session, not repo
history — do not `git add` or commit them unless the user explicitly asks for a
specific file to be checked in.
