# Releasing ExoJS

The coordinated release publishes the four lockstep packages — `@codexo/exojs`,
`@codexo/exojs-particles`, `@codexo/exojs-tilemap`, `@codexo/exojs-tiled` — at one
shared version via the two-stage, build-once pipeline (`scripts/release/`).

## Normal release

1. Land everything on `main`. Curate the `## [Unreleased]` CHANGELOG section into
   `## [x.y.z] - YYYY-MM-DD` (a concrete date — `release:notes` rejects "Unreleased").
2. Bump all four package versions in lockstep (and the peer ranges to `x.y.x`).
3. Tag and push: `git tag -a vX.Y.Z <commit> -m "ExoJS vX.Y.Z" && git push origin refs/tags/vX.Y.Z`.
4. The `Release` workflow checks out the **tag**, runs the full CI gate, builds
   once, packs/hashes/attw/consumer-tests the four tarballs, publishes them via
   OIDC (Core → Particles → Tilemap → Tiled) to a staging dist-tag, promotes all
   four to `latest`, and creates the GitHub release with the Full ZIP.

The workflow checks out the **tag commit**, so any fix to the release _scripts_
must be on the tag — re-point the tag (`git tag -d` + `git tag -a` + force-push)
after merging the fix to `main`. Editing only `release.yml` is enough for
workflow-YAML fixes (a `workflow_dispatch` from `main` picks those up), but
script fixes ride the checked-out tree.

## Adding a NEW package to the lockstep set (do this BEFORE its first release)

npm Trusted Publishing (OIDC) **cannot publish a package that does not yet exist**
on the registry ([npm/cli#8544](https://github.com/npm/cli/issues/8544)). If a new
extension package is part of a release, the coordinated publish will abort the
first time it reaches that package. Bootstrap it ahead of time instead:

1. As soon as `@codexo/exojs-<new>` exists in the monorepo, publish a one-off
   placeholder **manually** (e.g. a `0.0.0` or `x.y.z-next.0` prerelease, or the
   first real tarball with a local `npm login`).
2. **Immediately** create its Trusted Publisher config on npmjs.com:
   - Repository `Exoridus/ExoJS`, workflow `release.yml`, no environment.
   - **Enable both the publish AND the dist-tag/tag-management action** (configs
     created before 2026-05-20 are publish-only by default).
3. Ensure its `package.json` has a `repository` field with the monorepo
   `directory` subpath — `npm publish --provenance` refuses to build the SLSA
   attestation without it. `verify:release-matrix` enforces this.

From then on every publish (including the new package's first real release) flows
through OIDC with provenance, with no manual step during the release itself.

## Known limitation — `latest` promotion under OIDC

The publish stage promotes to `latest` with `npm dist-tag add`. OIDC mints a
token **only for `npm publish`**, not for `dist-tag add`, so the promotion step
fails with `E401` under pure Trusted Publishing. Until the pipeline is reworked
(publish directly to `latest`, or use a granular dist-tag token), promote
manually after a successful publish:

```
npm dist-tag add @codexo/exojs@X.Y.Z latest
npm dist-tag add @codexo/exojs-particles@X.Y.Z latest
npm dist-tag add @codexo/exojs-tilemap@X.Y.Z latest
npm dist-tag add @codexo/exojs-tiled@X.Y.Z latest
```

The packages are already published and immutable at this point — this only moves
the tag. `npm logout` afterwards if you logged in locally for this.

## Shift-left

`pnpm release:prepare --build --skip-zip` reproduces the pack → attw →
external-consumer pipeline locally without the Full ZIP. The `Release dry run` CI
lane runs it on every release-relevant PR, so pack/attw/consumer regressions
surface on a cheap PR instead of mid-flight on a tag.
