# ApplicationOptions Docs & Examples Migration
**Date:** 2026-05-19  
**Model:** claude-sonnet-4-6

---

## 1. Source Verification Summary

Inspected before making any changes:

| File | Key finding |
|------|-------------|
| `src/core/Application.ts` | `ApplicationOptions` is the grouped shape. `CanvasApplicationOptions` defaults: `width=800, height=600, pixelRatio=1, tabIndex=-1`. `resize(w,h)` takes **logical** dimensions, applies stored `_pixelRatio` internally via `_applyCanvasSize`. `tabIndex`: only overrides if not already set on an existing canvas element. `imageRendering`: assigned to `canvas.style.imageRendering` if supplied. |
| `src/resources/Loader.ts` | `LoaderOptions.basePath` (was `resourcePath`), `LoaderOptions.fetchOptions` (was `requestOptions`). Default `fetchOptions` set at Application level to `{ method: 'GET', mode: 'cors', cache: 'default' }`; at Loader level defaults to `{}`. |
| `src/rendering/webgl2/WebGl2Backend.ts` | Consumes `app.options.rendering.*` for debug, webglAttributes, batch sizes. |
| `src/rendering/webgpu/WebGpuBackend.ts` | Ignores all `rendering.*` options (WebGL2-only). |
| `src/input/InputManager.ts` | Consumes `app.options.input.gamepadDefinitions`, `gamepadSlotStrategy`. |
| `src/input/InteractionManager.ts` / `Pointer.ts` | Consumes `app.options.input.pointerDistanceThreshold`. |

Key semantics confirmed:
- `width`/`height` = logical CSS pixels; backing buffer = `Math.round(logical × pixelRatio)`.
- `canvas.style.width/height` = logical px (set by `_applyCanvasSize`).
- `app.resize(w, h)` takes logical dimensions; no DPR pre-multiplication needed by caller.
- `tabIndex` defaults to `-1` unless canvas already has `tabindex` attribute.
- `imageRendering` is a CSS hint on `canvas.style`; not an engine texture-filtering setting.
- `CacheRequest.requestOptions` (internal cache-strategy field) is **not** the same as the renamed `LoaderOptions.requestOptions → fetchOptions`. Left unchanged.

---

## 2. Files Changed

### Guide

| File | What changed |
|------|-------------|
| `site/src/content/guide/core-concepts/application.mdx` | Rewrote **Construction** section: flat options → grouped `canvas`/`loader`/`rendering`/`input`; added **High-DPI and pixel ratio** section covering `pixelRatio`, backing-buffer semantics, `app.resize`, and `imageRendering`; updated **Choosing the canvas** to use `canvas.element`. |
| `site/src/content/guide/core-concepts/loading-and-resources.mdx` | Changed `resourcePath` → `loader.basePath` in prose and IDB example; added Application usage example for `loader` group. |

### API docs (new)

| File | Content |
|------|---------|
| `site/src/content/api/application-options.mdx` | `ApplicationOptions` interface: all 6 top-level fields with defaults and cross-links. |
| `site/src/content/api/canvas-application-options.mdx` | `CanvasApplicationOptions`: all 6 fields with full sizing semantics section. |
| `site/src/content/api/rendering-application-options.mdx` | `RenderingApplicationOptions`: 4 fields, WebGL2-only note. |
| `site/src/content/api/input-application-options.mdx` | `InputApplicationOptions`: 3 fields. |
| `site/src/content/api/loader-options.mdx` | `LoaderOptions`: 5 fields (`basePath`, `fetchOptions`, `cache`, `cacheStrategy`, `concurrency`), Application usage example. |

### API docs (updated)

| File | What changed |
|------|-------------|
| `site/src/content/api/application.mdx` | Updated constructor signature `Partial<ApplicationOptions>` → `ApplicationOptions`; added grouped-options summary with cross-links. |
| `site/src/content/api/loader.mdx` | Updated constructor note; linked `LoaderOptions` page. |

### Content schema

| File | What changed |
|------|-------------|
| `site/src/content.config.ts` | Extended `kind` enum to include `'interface'` and `'type'` (was `'class'|'enum'` only). |

### README / site content

| File | What changed |
|------|-------------|
| `README.md` | Updated Quickstart snippet: `canvas, width, height` (flat) → `canvas: { element, width, height }` (grouped). |

### Examples

112 files migrated — every `.js` file in `examples/` that used the old flat `ApplicationOptions` shape.

---

## 3. What Was Migrated

### Application constructor shape

Old flat shape:
```js
new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
})
```

New grouped shape:
```js
new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
})
```

The `clearColor` and `backend` fields stay at the top level — they are not grouped.

### Loader option names

| Old | New |
|-----|-----|
| `resourcePath` | `loader.basePath` |
| `requestOptions` | `loader.fetchOptions` |

All 112 example files and all guide/API docs updated. No public-current references to the old names remain.

### Canvas grouping

`width`, `height` moved into `canvas: { width, height }`. All 112 example files updated via regex batch transformation.

### resize-and-dpr example special case

`examples/getting-started/resize-and-dpr.js` received additional treatment:
- Added `canvas.pixelRatio: window.devicePixelRatio || 1` to the constructor.
- Simplified the `resize` handler from 5 lines (manual DPR × dimensions + manual CSS style assignment) to 1 line: `app.resize(window.innerWidth, window.innerHeight)`.
- `_layout()` scene code unchanged — `this.app.canvas.width/height` still returns backing-buffer dimensions as before.

### Rendering/input grouping

Not present in any pre-migration examples or docs (no examples used `debug:`, `webglAttributes:`, `gamepadSlotStrategy:`, etc. as top-level Application options). New API docs document them under their respective group pages.

---

## 4. New Canvas/DPR Documentation

### pixelRatio

Documented in:
- Guide `application.mdx`: new **High-DPI and pixel ratio** section
- API `canvas-application-options.mdx`: `pixelRatio` property, **Sizing semantics** section

### resize semantics

`app.resize(w, h)` takes **logical** dimensions; stores them in `options.canvas.width/height`; internally computes `renderWidth = Math.round(w × pixelRatio)` and sets both `canvas.width/height` (buffer) and `canvas.style.width/height` (CSS). Documented in guide and `CanvasApplicationOptions` API page.

### imageRendering

Documented in:
- Guide `application.mdx`: included in the pixel-ratio section as a pixel-art hint example
- API `canvas-application-options.mdx`: `imageRendering` property, with the CSS-only caveat

### tabIndex

Documented in `canvas-application-options.mdx`. Not given a standalone guide section — only relevant in canvas/focus/keyboard context where `CanvasApplicationOptions` is already the right reference.

---

## 5. API Docs Updated / Added

New:
- `/en/api/application-options/`
- `/en/api/canvas-application-options/`
- `/en/api/rendering-application-options/`
- `/en/api/input-application-options/`
- `/en/api/loader-options/`

Updated:
- `/en/api/application/` — constructor note, grouped options cross-links
- `/en/api/loader/` — constructor note, `LoaderOptions` cross-link

No new example was added. The existing `getting-started/resize-and-dpr` example now demonstrates `pixelRatio` with the new grouped API. The guide explains all semantics. A dedicated `pixelRatio` example would be redundant given the guide coverage and the updated example.

---

## 6. Stale-Name Cleanup

### `resourcePath`

Public docs / examples: **zero remaining references**.

Remaining in repo:
- `docs/reviews/2026-05-api-product-ergonomics-review/*.md` — historical review documents that discuss the old API by name. Intentional.
- `dist/exo.esm.js` — stale pre-migration dist artifact. Not public docs.

### `requestOptions`

Public docs / examples: **zero remaining references**.

Remaining in source:
- `src/resources/CacheStrategy.ts` — `CacheRequest.requestOptions: RequestInit` — this is the **internal** cache-resolution request field name, not the `LoaderOptions` field that was renamed. These are distinct: `LoaderOptions.fetchOptions` (user-facing) vs. `CacheRequest.requestOptions` (internal bundle passed to `fetch()`). Left unchanged; renaming it is a separate concern.
- `src/resources/CacheFirstStrategy.ts`, `NetworkOnlyStrategy.ts` — destructure `requestOptions` from `CacheRequest`. Same reasoning.
- `src/resources/Loader.ts` — builds `CacheRequest` objects using `requestOptions: this._fetchOptions`. Same reasoning.

### Old flat `ApplicationOptions`

Public docs / examples: **zero remaining references**. All 112 examples and all guide + API docs updated.

---

## 7. Validation Results

All commands run from `C:\Users\User\Development\exojs`.

| Command | Result |
|---------|--------|
| `npm run typecheck` | ✅ Pass (0 errors) |
| `npm run lint:strict` | ✅ Pass (0 warnings, 0 errors) |
| `npm test` | ✅ 1374 tests passed, 103 suites |
| `site: npm run check-ts` | ✅ 0 errors, 0 warnings (23 pre-existing hints) |
| `site: npm run build` | ✅ 500 pages built in 43.69 s |

No example-specific compilation pass exists in the repo (examples are plain `.js` files run by the site's Vite dev server, not compiled by tsc). The site build syncs and bundles examples as part of `npm run build`.

---

## 8. Remaining Follow-ups

**None opened by this pass.** Deferred loop/timing architecture (`fpsLimit`, `backgroundFpsLimit`, `maxDeltaMs`, fixed timestep) intentionally untouched.

One possible future item: rename `CacheRequest.requestOptions → fetchOptions` to match the public `LoaderOptions.fetchOptions` name, for consistency at the custom-`CacheStrategy` implementor level. That is a source-only, non-breaking-to-callers rename and was deliberately out of scope here.
