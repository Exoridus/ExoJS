# Input and camera examples

The six curated targets keep their existing source slugs. Existing Kenney assets, the ship texture, public input actions, views and render-target APIs are reused; no Core or package API changes are included.

| Target                               | Implemented and exercised                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 Camera Navigation and Coordinates | Keyboard/stick pan, exponential wheel zoom, three coordinate landmarks, world marker picking, fixed screen/world readouts, reset and coordinate roundtrip.                                                                                                                                     |
| 11 Parallax Layers                   | Kenney cloud, hill and ground layers at 0.3/0.6/1.0, keyboard/stick or captured drag, per-layer factor labels, pause and reset. Background atlas rows are cropped and inset to preserve the cloud layer and avoid sampling empty atlas gaps.                                                   |
| 12 Local Split Screen                | Two Kenney characters in one world, independent keyboard/controller maps and follow cameras, connection status, readable divider and reset.                                                                                                                                                    |
| 13 Minimap                           | Action-controlled movement, a shared world rendered through main/map cameras, round render-texture HUD, reset and caller-owned teardown. Unchanged map geometry is retained between layout changes.                                                                                            |
| 14 Input Actions and Rebinding       | Movement and pulse, device prompts, Raw > Deadzone > Action readouts, conflict rejection, Cancel, Escape, Reset, persistent rebinding/reload and keyboard fallback after simulated disconnect. Prompt frame rows are normalized from the descriptors' bottom origin.                           |
| 15 Fly a Spaceship                   | Local hull/flame/muzzle rig, consistent heading conversion, inertial movement, bullets/collisions/score, two star layers, five visible slow asteroids, restart and pause. Sound and haptics default off; both require explicit opt-in, rumble can be stopped and the audio voice ends on exit. |

The runnable `input/key-rebinding`, `input/mouse-and-pointer` and `input/multitouch` sources are preserved. Their global subscriptions and overlays now end with the scene. Pointer capture is exercised by releasing a drag outside the canvas. The touch fixture retains contact IDs and cancel handling and adds pinch/focal-point/rotation readouts. Its `gesture-transform` source region converts gesture radians to the scene's opposite-signed degree convention. Guide and catalog integration is a separate change.

## Verification

All browser cases use the real Playground route and an isolated iframe presented at exactly 1280x720 or 512x288. Test-only route instrumentation forces and verifies the requested backend. Successful cases record startup/interaction screenshots and check actual state changes and teardown; failed cases retain failure captures. Startup alone is insufficient.

| Browser/backend | Cases               | Result                                              |
| --------------- | ------------------- | --------------------------------------------------- |
| Chromium WebGL2 | 9 sources x 2 sizes | PASS                                                |
| Chromium WebGPU | 9 sources x 2 sizes | PASS                                                |
| Firefox WebGL2  | 9 sources x 2 sizes | 16 PASS / 2 FAIL: pointer release beyond the iframe |

The spaceship check holds all eight keyboard headings and all eight simulated stick headings for at least 0.55 seconds, then verifies hull/muzzle direction, acceleration and relative shot direction within 5 degrees. A separate nearby asteroid fixture exercises collisions. Haptic opt-in/stop, neutral stick/deadzone, disconnect and both controller slots use simulated browser gamepads. Touch IDs, pinch, rotation and cancellation use synthetic pointer events; the ordinary desktop route also runs without a touch capability override.

- `pnpm exec vitest run --project=exojs test/examples/curation-b3.test.ts`: exit 0, 3 tests. The same guards rejected the unmodified scene bodies first (exit 1, 3 expected failures).
- `pnpm typecheck:examples`: exit 0.
- `pnpm --dir site check-ts:scripts`: exit 0.
- Targeted source/test/harness ESLint and Prettier checks: exit 0.
- `pnpm examples:sync:check`: exit 0.
- `pnpm lanes --base 84d7dbe4fa63f7a7e45b65f2f5bf49cefac95d46`: exit 0; integration lanes identified without running the full set.
- `git diff --check`: exit 0.

Run `pnpm --dir site exec tsx scripts/curation-b3-e2e.ts --browser chromium --backend webgl2`, replacing the browser/backend with `chromium/webgpu` or `firefox/webgl2` for the other required local lanes. The default dev server is port 4324; `--host` and `--shots` select another server and artifact directory.

Results: [Chromium WebGL2](evidence/b3/chromium-webgl2-results.json), [Chromium WebGPU](evidence/b3/chromium-webgpu-results.json), [Firefox WebGL2](evidence/b3/firefox-webgl2-results.json). Matching PNG files contain both sizes and startup/interaction states for successful cases; the Firefox pointer donor retains failure captures.

All 36 curated-target cases pass. The two remaining failures are the pointer donor's Firefox cross-frame release probe: after a captured drag crosses the iframe edge and releases, the held-button readout remains `1` instead of `0`. This observation is retained as red evidence; its shared/platform cause is outside this example change. The same held-button assertion also fails at both sizes in the inside-frame comparison, so the result does not isolate the iframe boundary as the cause. The bounded `--capture-inside` probe narrows the canvas to 90% of the unchanged iframe box so the same release can be tested outside the canvas while still inside the iframe. See [cross-frame result](evidence/b3/firefox-webgl2-mouse-and-pointer-results.json), [inside-frame result](evidence/b3/firefox-webgl2-mouse-and-pointer-inside-results.json) and [exact source/runtime hashes](evidence/b3/source-hashes.json).

Physical touch, physical controllers, physical rumble and human listening are **NOT_TESTED**. Firefox WebGPU was not run. Full pre-push validation and publication remain pending the serialized integration run.
