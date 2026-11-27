# Same-frame keyboard focus regression

Pressing and releasing Shift+Tab between two engine frames used to traverse forward: FocusController read the final Shift channel after both release events had already cleared it. Keyboard transitions now retain the aggregate Shift state at their own arrival time. Dispatch exposes that state internally without changing public keyboard signal arguments or the frame-end action sample. Existing two-handed modifier reconciliation remains authoritative.

Three of four new real BrowserPlatform/InputSystem regression cases fail before the repair. All77 tests across the journal, focus-controller and physical-keyboard files pass afterward. Core typecheck, touched-file lint and package export verification pass. API artifacts were regenerated with no tracked changes. The four journal cases cover a released chord, release before plain Tab, one of two Shift keys remaining held, and alternating traversals within one frame.

The six browser cases use the curated settings example at commit b44642b73dc647fac3737ad5da7024d220e4ba28, with only the two recorded runtime modules replaced by this build. Chromium WebGL2, Chromium WebGPU and Firefox WebGL2 each pass at1280x720 and512x288, including the formerly failing compact Chromium cases. The original red acceptance records remain with that example. The JSON and PNG files here record the repaired cases; source-hashes.json pins source and runtime bytes.

Run the named unit files with pnpm exec vitest run --project=exojs test/input/focus-keyboard-journal.test.ts test/input/focus-controller.test.ts test/input/keyboard-codes.test.ts. The browser scenario is site/scripts/curation-b2-e2e.ts --only settings-menu in the curated example branch.

Physical keyboard hardware, IME and mobile keyboards are not certified by browser automation. The input repair has no file overlap with the separate rendering/lifecycle repair candidate.
