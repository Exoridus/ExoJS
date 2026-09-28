# Local validation

The lane table in `scripts/ci/lanes.ts` remains the source of truth. Local lanes run sequentially: concurrent rendering, allocation and benchmark measurements on one machine compete for resources and must not be treated as independent measurements. This runner does not remove test cases, relax baselines, retry failures automatically or reuse earlier PASS results.

## Normal work

Run named tests while editing. Inspect the affected lanes before pushing:

```sh
pnpm lanes --base origin/next
```

The pre-push hook still runs its static gates and the required lanes. Do not run a complete duplicate suite immediately before that hook. A first push can be scoped against `origin/HEAD` by the existing hook rather than `origin/next`; inspect the actual printed range. The base-selection policy is unchanged by this tooling change.

## Diagnose one lane

```sh
pnpm lanes --run --only webgpu --output compact
pnpm lanes --run --only bench --output normal
```

`--only` selects named local lanes independently of the current diff. Its result explicitly says **diagnostic subset**, not full validation. Unknown names and incompatible options fail before starting commands. After correcting a failure, the complete selected validation still has to pass. A bare `pnpm test:browser:webgpu` does not use this lane supervisor or its repository lock.

The local WebGPU lane passes `--no-file-parallelism --reporter=verbose` to the existing test script. The default reporter stalls local non-TTY runs until the lane deadline; the verbose reporter completes the same inventory. It runs the same test inventory with reduced simultaneous browser-file pressure. CI deliberately keeps its existing WebGPU concurrency until measurements on its own runner justify a change. This is resource isolation, not proof that a driver hang or test-lifecycle defect has been fixed.

## Time limits, ownership and logs

Each local lane receives the same configured execution budget as its CI entry: 20 minutes when unspecified and 30 minutes for `bench`. The deadline covers the lane command, not CI checkout/setup. Termination can add up to several seconds for OS cleanup. Timeout returns 124, interruption returns 130 or 143, and ordinary command failures retain their exit status. The general `runCommand` helper only applies a deadline when its caller supplies one, so unrelated long-running tools do not silently acquire a new limit.

A running lane reports its PID, elapsed time, deadline and log location every 30 seconds except in silent mode. Every output mode writes a unique complete log in the invocation's `.workspace/logs/`. Normal and verbose also stream it live. Failure tails are bounded by lines and characters; the complete disk log is retained. The lane invocation writes a unique JSON summary with the selected lanes, actual results and a `completed` flag. Lanes not run after a failure have no result and are never counted as passing.

Only the started command's process ancestry is targeted. POSIX cleanup signals its process group and descendant-owned groups, then escalates after a grace period. Windows takes an ancestry snapshot through CIM, rechecks process creation identity and uses `taskkill /PID ... /T /F`. No executable-name sweep or start-time-only ownership guess is used. A cleanup failure remains a failed run and leaves the repository lock for inspection. Fully detached/reparented daemons, PID reuse before ancestry capture, forced termination of the supervisor itself and OS-enforced access restrictions are outside a portable user-space supervisor's guarantee; this is not an OS job-object isolation boundary.

The lock lives in the Git common directory, so linked worktrees cannot start simultaneous lane runners for the same repository. A second invocation fails with the owner PID and worktree rather than waiting invisibly. Locks are released after orderly completion/cancellation. An abandoned lock is not automatically stolen: inspect the recorded PID and surviving descendants, then remove that exact lock file. Never stop all Node or Chromium processes to recover a test run. Direct test commands outside `pnpm lanes --run` are not covered by this lock.

## Supervisor regression tests

```sh
node --test test/ci/validation.node.ts
```

These dependency-free Node tests launch bounded child-process fixtures; they do not substitute fake processes for cancellation and ownership checks. The CLI tests deliberately use a fake `pnpm` executable to test selection, argument forwarding, fail-fast behavior and reports without running the rendering suites recursively. The existing unit lane runs these tests before its unchanged Vitest/allocation/physics commands. A separate path-gated Windows workflow exercises native Windows process cleanup; it does not alter the existing CI verdict or branch-protection settings. The Windows signal cases exercise the same handlers via IPC because `ChildProcess.kill()` does not emulate console Ctrl+C there.

No supervisor test proves rendering correctness or renderer throughput. Qualify those through the existing browser lanes and benchmark contracts. Record the actual adapter/browser, selected files, last completed test and complete log when investigating a stalled browser run.
