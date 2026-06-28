# Releasing ExoJS

The coordinated release publishes the lockstep packages — `@codexo/exojs`,
`@codexo/exojs-particles`, `@codexo/exojs-tilemap`, `@codexo/exojs-tiled`,
`@codexo/exojs-physics`, `@codexo/exojs-audio-fx`, `@codexo/exojs-aseprite`,
`@codexo/exojs-ldtk`, `@codexo/exojs-react` — at one shared version via the
two-stage, build-once pipeline (`scripts/release/`). The package set is defined
once in `scripts/release/lockstep-packages.ts` (the single source of truth every
release script derives from).

## Normal release

The version bump and git tag are created atomically by `release:cut`. This
prevents the failure mode where a bump PR lands on `main` but the tag is never
pushed (leaving an untagged version in the tree indefinitely).

1. **Land everything on `main`.** Feature PRs merge without version bumps — the
   packages stay at the previous version throughout development.

2. **Write the CHANGELOG section.** Add `## [x.y.z] - YYYY-MM-DD` at the top of
   `CHANGELOG.md` with the curated release notes. Merge this as a regular PR (or
   commit directly). The date must be concrete — `release:notes` rejects placeholders.

3. **Run `release:cut` locally.** This bumps every lockstep `package.json` file and
   peer ranges, runs the lockstep and release-matrix gates, commits, and creates the
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
   full CI gate, builds once, packs/hashes/attw/consumer-tests the tarballs, and
   publishes them directly to the `latest` dist-tag via OIDC in lockstep order
   (Core first, then the extensions). Every tarball is `attw`-checked; the offline
   consumer smoke covers all packages **except `@codexo/exojs-react`** (its
   `react`/`react-dom` peers are not resolvable in the offline throwaway project —
   it is still bumped and published). A GitHub release with the Full ZIP is created
   automatically.

7. **Confirm the release.** After CI completes, verify:

   ```bash
   npm view @codexo/exojs version           # should show x.y.z
   npm view @codexo/exojs-physics version   # should show x.y.z
   # repeat for every lockstep package
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
   - Enable the **publish** action (OIDC publishes directly to `latest` — no
     dist-tag promotion step).
3. Ensure its `package.json` has a `repository` field with the monorepo
   `directory` subpath — `npm publish --provenance` refuses to build the SLSA
   attestation without it. `verify:release-matrix` enforces this.
4. Add the new package as a **single entry** in
   `scripts/release/lockstep-packages.ts` — the source of truth that `cut.ts`,
   `manifest.ts`, `prepare.ts`, `run.ts`, the `verify-*` gates and the
   external-consumer smoke all derive from. Then mirror it in the two places that
   cannot import that TS module: add its directory to `RUNTIME_PACKAGES` in
   `scripts/ci/select-lanes.mjs`, and add its `--filter` to the build/typecheck/pack
   steps in `.github/workflows/_ci-checks.yml` and the build step in `release.yml`
   (`verify:release-matrix` enforces the `release.yml` build lines, so a forgotten
   one fails CI rather than silently skipping the package).

From then on every publish (including the new package's first real release) flows
through OIDC with provenance, with no manual step during the release itself.
