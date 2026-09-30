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

The local WebGPU lane passes `--no-file-parallelism` to the Core test script and then runs the Media project. It runs the same test inventory with reduced simultaneous browser-file pressure. CI deliberately keeps its existing WebGPU concurrency until measurements on its own runner justify a change. This is resource isolation, not proof that a driver hang or test-lifecycle defect has been fixed.

## Time limits, ownership and logs

Each local lane receives the same configured execution budget as its CI entry: 20 minutes when unspecified and 30 minutes for `bench` and for the browser lanes that run several qualification rows (`webgl`, `webgpu`, `firefox`), whose budget must exceed the sum of their rows' deadlines. The deadline covers the lane command, not CI checkout/setup. Termination can add up to several seconds for OS cleanup. Timeout returns 124, interruption returns 130 or 143, and ordinary command failures retain their exit status. The general `runCommand` helper only applies a deadline when its caller supplies one, so unrelated long-running tools do not silently acquire a new limit.

A running lane reports its PID, elapsed time, deadline and log location every 30 seconds except in silent mode. Every output mode writes a unique complete log in the invocation's `.workspace/logs/`. Normal and verbose also stream it live. Failure tails are bounded by lines and characters; the complete disk log is retained. The lane invocation writes a unique JSON summary with the selected lanes, actual results and a `completed` flag. Lanes not run after a failure have no result and are never counted as passing.

Only the started command's process ancestry is targeted. POSIX cleanup signals its process group and descendant-owned groups, then escalates after a grace period. Windows takes an ancestry snapshot through CIM, rechecks process creation identity and uses `taskkill /PID ... /T /F`. A root that Node has not yet reported as exited still holds its PID (Windows does not reuse a PID while a handle is open), so only an exited root is compared against the recorded spawn interval, with a tolerance for the coarse clocks of Node and the kernel. No executable-name sweep or start-time-only ownership guess is used. A cleanup failure remains a failed run and leaves the repository lock for inspection. Fully detached/reparented daemons, PID reuse before ancestry capture, forced termination of the supervisor itself and OS-enforced access restrictions are outside a portable user-space supervisor's guarantee; this is not an OS job-object isolation boundary.

The lock lives in the Git common directory, so linked worktrees cannot start simultaneous lane runners for the same repository. A second invocation fails with the owner PID and worktree rather than waiting invisibly. Locks are released after orderly completion/cancellation. An abandoned lock is not automatically stolen: inspect the recorded PID and surviving descendants, then remove that exact lock file. Never stop all Node or Chromium processes to recover a test run. Direct test commands outside `pnpm lanes --run` are not covered by this lock.

## Supervisor regression tests

```sh
node --test test/ci/validation.node.ts
```

These dependency-free Node tests launch bounded child-process fixtures; they do not substitute fake processes for cancellation and ownership checks. The CLI tests deliberately use a fake `pnpm` executable to test selection, argument forwarding, fail-fast behavior and reports without running the rendering suites recursively. The existing unit lane runs these tests before its unchanged Vitest/allocation/physics commands. A separate path-gated Windows workflow exercises native Windows process cleanup; it does not alter the existing CI verdict or branch-protection settings. The Windows signal cases exercise the same handlers via IPC because `ChildProcess.kill()` does not emulate console Ctrl+C there.

No supervisor test proves rendering correctness or renderer throughput. Qualify those through the existing browser lanes and benchmark contracts. Record the actual adapter/browser, selected files, last completed test and complete log when investigating a stalled browser run.

## Browser qualification matrix

This is the one description of what the browser lanes run. The lane table in `scripts/ci/lanes.ts` and the projects in `vitest.config.ts` are the source of truth; browser launch options live in `scripts/ci/browser-profiles.ts` and are shared by the suites and by the capability preflight, so a probe describes the browser the suite is about to start.

Every browser suite runs on CI as a row of `pnpm qualify`, which probes the host, runs the command under the validation supervisor (unique persistent log, outer deadline, owned-process-tree cleanup), records the result under `test-results/qualification/` and appends it to the GitHub step summary. A row ends in one of three outcomes. **PASS**: the capability existed and the assertions ran green. **UNSUPPORTED HOST**: an informational row found a capability missing, ran nothing and proved nothing; the reason is printed, and a skip is never evidence of support. **FAIL**: a required row lost a capability, its suite failed, its deadline passed or the probe itself could not run; the failure kind (`capability`, `test`, `timeout`, `infrastructure`) says which. Only a required row can turn a job red, and a green job says nothing about an informational row: read the step summary for those.

| Row                                            | Vitest project                                                               | Browser and display                     | Backend                                                                        | Policy                                            | JUnit / skip budget                               | Files                                  | Deadline   |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------- | ---------- |
| Chromium / WebGL2 Core                         | `browser-webgl-chromium`                                                     | new headless Chromium                   | ANGLE SwiftShader (CPU)                                                        | required                                          | `webgl` / yes                                     | serial                                 | 10 min     |
| Chromium / Build Output, Assets, Core Surfaces | `browser-build-chromium`, `browser-assets-chromium`, `browser-core-chromium` | headless Chromium                       | none needed                                                                    | required                                          | `webgl-build`, `webgl-assets`, `webgl-core` / yes | parallel                               | 6 min each |
| Chromium / WebGPU Core                         | `browser-webgpu`                                                             | CI: headed under Xvfb; locally headless | CI: Chromium's bundled SwiftShader fallback adapter; locally the machine's GPU | required                                          | `webgpu` / yes                                    | parallel on CI, serial in `pnpm lanes` | 15 min     |
| Chromium / WebGPU Media                        | `browser-webgpu-media`                                                       | same as Core                            | same as Core                                                                   | required                                          | `webgpu-media` / yes                              | serial                                 | 6 min      |
| Firefox / WebGL2 Core                          | `browser-webgl-firefox`                                                      | CI: headed under Xvfb; locally headless | software WebRender; native OpenGL                                              | required                                          | `firefox` / yes                                   | serial                                 | 8 min      |
| Firefox / WebGPU Core                          | `browser-webgpu-firefox`                                                     | headed (Xvfb on Linux)                  | whatever adapter Firefox exposes                                               | informational                                     | none / outside the budget                         | parallel                               | 10 min     |
| Firefox / WebGPU Media                         | `browser-webgpu-firefox-media`                                               | headed                                  | as above                                                                       | informational, runs only if Core found an adapter | none / outside the budget                         | serial                                 | 5 min      |
| Firefox / WebGPU Isolated Specs                | `browser-webgpu-firefox-isolated`                                            | headed                                  | as above                                                                       | informational, runs only if Core found an adapter | none / outside the budget                         | serial                                 | 4 min      |
| Chromium / Audio Worklets                      | `browser-audio-chromium`                                                     | headless Chromium                       | none needed                                                                    | required, path-gated                              | `audio` / yes                                     | parallel                               | 8 min      |
| Chromium / Tilemap Worker                      | `browser-tilemap-chromium`                                                   | headless Chromium                       | none needed                                                                    | required, path-gated                              | `tilemap` / yes                                   | parallel                               | 8 min      |
| Chromium / Bench Structural                    | driven by the benchmark harness                                              | Chromium                                | see the harness                                                                | required, path-gated                              | none / outside the budget                         | n/a                                    | 25 min     |

Firefox WebGL2 is the required second-engine path. Two specs run in a Firefox of their own so that they cannot cost the Core run: the device-churn regression crashes Firefox's GPU process on Windows (after which `requestAdapter()` is `null` for the rest of that browser) and the OffscreenCanvas surface spec intermittently blocks the page inside native WebGPU code, where no test timeout can fire. Firefox also rejects a `VideoFrame` or `HTMLVideoElement` as a `copyExternalImageToTexture` source, which the video specs report as a capability gap rather than an engine failure. Firefox WebGPU is informational because Firefox on Linux may expose no adapter at all and a headless Firefox never does; it is probed first, and a host without an adapter reports UNSUPPORTED HOST in seconds. WebGPU Core and WebGPU Media are separate projects so a failure of the browser media stack (`captureStream`, `HTMLVideoElement` playback, `GPUExternalTexture`) cannot make the renderer contract look broken; `test/ci/browser-project-split.test.ts` keeps the glob that selects the media specs in step with the specs that use media APIs. The parity matrix runs inside WebGPU Core. Example smoke is a separate job (`--renderer webgl2`; one example per category on pull requests, the whole catalog on pushes) and is not part of this matrix. Real-hardware runs (`pnpm test:parity`, `pnpm lanes --run --only webgpu` on a machine with a physical GPU) are a separate local qualification layer.

CI's Chromium WebGPU rows run against Chromium's bundled SwiftShader software adapter (`isFallbackAdapter: true`). The runner also installs Mesa's lavapipe and points `VK_DRIVER_FILES` at it, but the preflight log shows that Chromium does not select it. That still exercises WGSL compilation, pipeline and bind-group creation, texture formats, render passes, blending, readback, device lifecycle and the renderer's semantic probes for real. It does not prove NVIDIA, AMD or Intel behavior, driver-specific precision or hardware performance. The preflight log names the adapter and the fallback flag, so a change of adapter is visible.

```sh
pnpm qualify --row "Firefox / WebGPU Core" --preflight firefox-webgpu --requires webgpu-device --policy informational --timeout 10 -- pnpm test:browser:webgpu:firefox
pnpm qualify --report
```

`--after "<row>"` skips a row (NOT RUN) when the named row found its capability unavailable. A deadline is how long a healthy run takes with headroom, not a knob to raise when a run hangs: a run that stops making progress is a lifecycle or supervision defect. Each lane's job timeout stays above the sum of its rows' deadlines, so the row deadline fires first and leaves a log. Failed CI jobs upload `.workspace/logs/` (one unique log per command) and the qualification records.
