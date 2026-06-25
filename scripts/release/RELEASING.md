# Releasing ExoJS

The coordinated release publishes the six lockstep packages — `@codexo/exojs`,
`@codexo/exojs-particles`, `@codexo/exojs-tilemap`, `@codexo/exojs-tiled`,
`@codexo/exojs-physics`, `@codexo/exojs-audio-fx` — at one shared version via the
two-stage, build-once pipeline (`scripts/release/`).

## Normal release

The version bump and git tag are created atomically by `release:cut`. This
prevents the failure mode where a bump PR lands on `main` but the tag is never
pushed (leaving an untagged version in the tree indefinitely).

1. **Land everything on `main`.** Feature PRs merge without version bumps — the
   packages stay at the previous version throughout development.

2. **Write the CHANGELOG section.** Add `## [x.y.z] - YYYY-MM-DD` at the top of
   `CHANGELOG.md` with the curated release notes. Merge this as a regular PR (or
   commit directly). The date must be concrete — `release:notes` rejects placeholders.

3. **Run `release:cut` locally.** This bumps all six `package.json` files and peer
   ranges, runs the lockstep and release-matrix gates, commits, and creates the
   annotated tag — all in one step:

   ```bash
   pnpm release:cut --version x.y.z
   ```

   The script verifies the CHANGELOG section exists, the tree is clean, and the
   tag does not yet exist before touching anything.

4. **Run the local dry-run** to catch pack/attw/consumer regressions before
   pushing:

   ```bash
   pnpm release:prepare --build --skip-zip
   ```

5. **Push both the commit and the tag:**

   ```bash
   git push && git push origin refs/tags/vx.y.z
   ```

6. **Watch the CI.** The `Release` workflow checks out the **tag commit**, runs the
   full CI gate, builds once, packs/hashes/attw/consumer-tests the six tarballs,
   and publishes them via OIDC (Core → Particles → Tilemap → Tiled → Physics →
   Audio-FX). A GitHub release with the Full ZIP is created automatically.

7. **Confirm the release.** After CI completes, verify:

   ```bash
   npm view @codexo/exojs version           # should show x.y.z
   npm view @codexo/exojs-physics version   # should show x.y.z
   # repeat for all six packages
   ```

The workflow checks out the **tag commit**, so fixes to release _scripts_ must be
on the tag — re-point it (`git tag -d` + `git tag -a` + `git push --force-with-lease
origin refs/tags/vx.y.z`) after merging the fix to `main`. For workflow-YAML-only
fixes, a `workflow_dispatch` from `main` is sufficient.

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
4. Add the new package to `LOCKSTEP_DIRS` in `scripts/release/cut.ts` and the
   relevant lists in `manifest.ts` / `prepare.ts`.

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
npm dist-tag add @codexo/exojs-physics@X.Y.Z latest
npm dist-tag add @codexo/exojs-audio-fx@X.Y.Z latest
```

The packages are already published and immutable at this point — this only moves
the tag. `npm logout` afterwards if you logged in locally for this.
