// Type contract for the public RenderingContext/View surface: the render
// entry points' optional-`view` shape (vs. `renderTo`'s required `target`),
// `RenderingContext`'s structural conformance to the shared `DrawContext`
// verb set, `CaptureOptions.format`'s closed `ColorTextureFormat` union, and
// View's closed screenToWorld/worldToScreen overload pairs. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import {
  type CaptureOptions,
  type DrawContext,
  Geometry,
  Matrix,
  RenderBatch,
  RenderingContext,
  type RenderNode,
  RenderTexture,
  TextureFormat,
  View,
} from '@codexo/exojs';
import { type RenderBackend } from '@codexo/exojs/renderer-sdk';

declare const backend: RenderBackend;
declare const node: RenderNode;
declare const geometry: Geometry;
declare const transform: Matrix;
declare const batch: RenderBatch;

const ctx = new RenderingContext(backend);
const view = new View(0, 0, 100, 100);

// render/drawGeometry/drawBatch all take an optional `{ view }` override.
ctx.render(node);
ctx.render(node, {});
ctx.render(node, { view });
ctx.drawGeometry(geometry, transform);
ctx.drawGeometry(geometry, transform, { view });
ctx.drawBatch(batch);
ctx.drawBatch(batch, { view });

// renderTo's `target` is required — the off-screen destination, unlike the
// optional `view` override shared by the other draw verbs.
ctx.renderTo(node, { target: new RenderTexture(64, 64) });
ctx.renderTo(node, { target: new RenderTexture(64, 64), view, clear: undefined });
// @ts-expect-error — renderTo's `target` cannot be omitted.
ctx.renderTo(node, { view });

// RenderingContext structurally satisfies the shared DrawContext verb set —
// this is what lets a pass-scoped context substitute for the frame-level one.
const asDrawContext: DrawContext = ctx;
void asDrawContext;

// A hand-authored DrawContext must implement every verb, including the
// `backend` escape hatch — not just the draw methods.
const literalDrawContext: DrawContext = {
  render(_renderNode, _options) {
    // noop
  },
  renderTo(_renderNode, _options) {
    // noop
  },
  clear(_color) {
    // noop
  },
  drawGeometry(_renderGeometry, _renderTransform, _options) {
    // noop
  },
  drawBatch(_renderBatch, _options) {
    // noop
  },
  backend,
};
void literalDrawContext;

// @ts-expect-error — DrawContext requires the `backend` escape hatch too.
const missingBackend: DrawContext = {
  render(_renderNode, _options) {
    // noop
  },
  renderTo(_renderNode, _options) {
    // noop
  },
  clear(_color) {
    // noop
  },
  drawGeometry(_renderGeometry, _renderTransform, _options) {
    // noop
  },
  drawBatch(_renderBatch, _options) {
    // noop
  },
};
void missingBackend;

// capture()'s format is a closed ColorTextureFormat union, not a free string.
const captureOptions: CaptureOptions = { width: 64, height: 64, format: TextureFormat.Rgba16F };
void captureOptions;
// @ts-expect-error — not a member of the closed ColorTextureFormat union.
const badFormat: CaptureOptions = { width: 64, height: 64, format: 'rgba64f' };
void badFormat;

// View.screenToWorld / worldToScreen are a closed 2-arg/4-arg overload pair
// (design-space vs. canvas-backing-store-space) — a 3-arg call is neither.
view.screenToWorld(0, 0);
view.screenToWorld(0, 0, 800, 600);
// @ts-expect-error — no 3-argument overload exists.
view.screenToWorld(0, 0, 800);

view.worldToScreen(0, 0);
view.worldToScreen(0, 0, 800, 600);
// @ts-expect-error — no 3-argument overload exists.
view.worldToScreen(0, 0, 800);

// View.follow accepts a SceneNode, a bare {x, y}, or null — nothing else.
view.follow(null);
view.follow({ x: 1, y: 2 });
// @ts-expect-error — a follow target must carry both x and y.
view.follow({ x: 1 });

export { ctx, view };
