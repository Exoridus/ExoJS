# Releasing ExoJS

The coordinated release publishes the lockstep packages — `@codexo/exojs`,
`@codexo/exojs-particles`, `@codexo/exojs-tilemap`, `@codexo/exojs-tiled`,
`@codexo/exojs-physics`, `@codexo/exojs-audio-fx`, `@codexo/exojs-aseprite`,
`@codexo/exojs-ldtk`, `@codexo/exojs-react` — at one shared version via the
two-stage, build-once pipeline (`scripts/release/`). The package set is defined
once in `scripts/release/lockstep-packages.ts` (the single source of truth every
release script derives from).

## Normal release

`main` always reflects the last released version; `next` is where feature and
fix PRs land between releases (see `CONTRIBUTING.md`). The version bump and
git tag are created atomically by `release:cut`. This prevents the failure
mode where a bump PR lands but the tag is never pushed (leaving an untagged
version in the tree indefinitely).

1. **Land everything on `next`.** Feature PRs merge without version bumps — the
   packages stay at the previous version throughout development.

2. **Keep the CHANGELOG's `## [Unreleased]` section current.** Entries land
   with the change that causes them, under `## [Unreleased]` at the top of
   `CHANGELOG.md` - the Keep a Changelog shape this file declares in its own
   second line. `release:cut` dates that section as the release and opens a
   fresh empty one, so nothing has to be written twice and no pull request ever
   carries a heading naming a version nobody has bumped to yet (which is what
   `release-coherence` refuses).

3. **Merge `next` into `main`.** Fast-forward if `main` has taken no patch
   commits since the last release; otherwise a regular merge commit:

   ```sh
   git switch main && git pull
   git merge --ff-only next || git merge next   # ff-only first, merge commit if that fails
   ```

4. **Run `release:cut` locally, on `main`.** This bumps every lockstep
   `package.json` file and peer ranges, runs the lockstep and release-matrix
   gates, commits, and creates the annotated tag — all in one step:

   ```bash
   pnpm release:cut --version x.y.z
   ```

   The script verifies the CHANGELOG section exists, the tree is clean, and the
   tag does not yet exist before touching anything.

5. **Run the local dry-run** to catch pack/attw/consumer regressions before
   pushing:

   ```bash
   pnpm release:prepare --build --skip-zip
   ```

6. **Push both the commit and the tag:**

   ```bash
   git push && git push origin refs/tags/vx.y.z
   ```

7. **Watch the CI.** The `Release` workflow checks out the **tag commit**, runs the
   full CI gate, builds once, packs/hashes/attw/consumer-tests the tarballs, and
   publishes them directly to the `latest` dist-tag via OIDC in lockstep order
   (Core first, then the extensions). Every tarball is `attw`-checked; the offline
   consumer smoke covers all packages **except `@codexo/exojs-react`** (its
   `react`/`react-dom` peers are not resolvable in the offline throwaway project —
   it is still bumped and published). A GitHub release with the Full ZIP is created
   automatically.

8. **Confirm the release.** After CI completes, verify:

   ```bash
   npm view @codexo/exojs version           # should show x.y.z
   npm view @codexo/exojs-physics version   # should show x.y.z
   # repeat for every lockstep package
   ```

9. **Fast-forward `next` past the release commit**, so the version bump and
   parity-claim commits are on both lines and `next`'s next feature PR diffs
   against the released state, not against it plus an unmerged bump:

   ```sh
   git switch next && git pull
   git merge --ff-only main
   git push
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

1. As soon as `@codexo/exojs-<new>` exists in the monorepo, publish it once with
   the bootstrap command. It builds, packs and publishes that one package
   **without** `--provenance` (there is no trusted publisher to attest against
   yet), refuses a name that is already on the registry, and is a dry-run until
   `--execute`:

   ```bash
   npm login                                                    # granular token, publish scope
   pnpm release:bootstrap @codexo/exojs-<new>                   # dry-run
   pnpm release:bootstrap @codexo/exojs-<new> --execute
   ```

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
   `scripts/ci/select-lanes.ts`, and add its `--filter` to the build/typecheck/pack
   steps in `.github/workflows/_ci-checks.yml` and the build step in `release.yml`
   (`verify:release-matrix` enforces the `release.yml` build lines, so a forgotten
   one fails CI rather than silently skipping the package).

From then on every publish (including the new package's first real release) flows
through OIDC with provenance, with no manual step during the release itself.

## Packages off the lockstep line

`@codexo/exojs-build` and `create-exo-app` are published on their own version
lines (`INDEPENDENT_PACKAGES` in `scripts/release/lockstep-packages.ts`): the
first is build tooling a consumer keeps across engine upgrades, the second is a
scaffolder run once via `npx`. Neither is in `PUBLISH_ORDER`, so **no
coordinated release ever publishes them** - they are released one at a time,
whenever their own version is bumped:

```bash
pnpm release:publish-independent create-exo-app              # dry-run
pnpm release:publish-independent create-exo-app --execute    # publishes with --provenance
```

The command refuses a lockstep package (the coordinated release owns those), is
a no-op for a version already on the registry, and points at
`release:bootstrap` when the name does not exist yet. The very first publish of
one of these names goes through `release:bootstrap` like any other new package,
followed by its Trusted Publisher config on npmjs.com.

### Open at the time of writing (checked against the registry 2026-08-29)

- `@codexo/exojs-tilemap-physics` is in `LOCKSTEP_PACKAGES` and therefore in
  `PUBLISH_ORDER`, but has never been published (npm answers E404). The next
  coordinated release would reach it and abort the chain there.

  **Bootstrap it as part of that release, not before it:** run `release:cut`
  first so the package carries the release version, then
  `pnpm release:bootstrap @codexo/exojs-tilemap-physics --execute`, then
  register its trusted publisher, and only then run the coordinated publish -
  which skips it as already-published and publishes everything else with
  provenance. Bootstrapping it earlier publishes a version (today `0.15.2`)
  that no release will ever correspond to.

- `create-exo-app` and `@codexo/exojs-build` **are** published, both at `0.1.0`,
  which is what their `package.json` says. They need no bootstrap; their next
  versions go out with `release:publish-independent`.
