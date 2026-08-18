// Type contract for the `renderer-sdk` backend-authoring surface: the
// typesafe drawable/backend pairing enforced by
// `RendererRegistry.registerRenderer`, and a spot check that the renderer
// lifecycle contract (`Renderer<Runtime, Target>`) and the `RenderBackendType`
// vocabulary are still importable as values, not just types — a renderer
// author's `backendType: RenderBackendType.WebGl2` field would stop
// compiling if either regressed to a type-only re-export. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import {
  AbstractWebGl2Renderer,
  AbstractWebGpuRenderer,
  Drawable,
  RenderBackendType,
  type Renderer,
  RendererRegistry,
  WebGl2Backend,
} from '@codexo/exojs/renderer-sdk';

// Two distinct drawable subtypes — distinguished by a literal `kind` field so
// they are not structurally interchangeable (an empty subclass body would be
// structurally identical to `Drawable` itself and defeat the mismatch checks
// below).
class SpriteLikeDrawable extends Drawable {
  public readonly kind = 'sprite-like' as const;
}
class MeshLikeDrawable extends Drawable {
  public readonly kind = 'mesh-like' as const;
}

class SpriteLikeGl2Renderer extends AbstractWebGl2Renderer<SpriteLikeDrawable> {
  protected onConnect(_backend: WebGl2Backend): void {
    // noop
  }
  protected onDisconnect(): void {
    // noop
  }
  public render(_drawable: SpriteLikeDrawable): void {
    // noop
  }
  public flush(): void {
    // noop
  }
}

class MeshLikeGl2Renderer extends AbstractWebGl2Renderer<MeshLikeDrawable> {
  protected onConnect(_backend: WebGl2Backend): void {
    // noop
  }
  protected onDisconnect(): void {
    // noop
  }
  public render(_drawable: MeshLikeDrawable): void {
    // noop
  }
  public flush(): void {
    // noop
  }
}

class SpriteLikeGpuRenderer extends AbstractWebGpuRenderer<SpriteLikeDrawable> {
  protected onConnect(): void {
    // noop
  }
  protected onDisconnect(): void {
    // noop
  }
  public render(_drawable: SpriteLikeDrawable): void {
    // noop
  }
  public flush(): void {
    // noop
  }
}

const gl2Registry = new RendererRegistry<WebGl2Backend>();

// A renderer whose Target matches the registered drawable is accepted.
gl2Registry.registerRenderer(SpriteLikeDrawable, new SpriteLikeGl2Renderer());

// @ts-expect-error — the renderer's Target (MeshLikeDrawable) does not match the drawable being registered (SpriteLikeDrawable).
gl2Registry.registerRenderer(SpriteLikeDrawable, new MeshLikeGl2Renderer());

// @ts-expect-error — a WebGPU-backend renderer cannot register on a registry typed for the WebGL2 backend.
gl2Registry.registerRenderer(SpriteLikeDrawable, new SpriteLikeGpuRenderer());

// A hand-authored object literal must implement the full Renderer contract.
const validLiteralRenderer: Renderer<WebGl2Backend, SpriteLikeDrawable> = {
  backendType: RenderBackendType.WebGl2,
  connect(_backend) {
    // noop
  },
  disconnect() {
    // noop
  },
  render(_drawable) {
    // noop
  },
  flush() {
    // noop
  },
};
void validLiteralRenderer;

// @ts-expect-error — missing `flush` does not satisfy the Renderer contract.
const missingFlush: Renderer<WebGl2Backend, SpriteLikeDrawable> = {
  backendType: RenderBackendType.WebGl2,
  connect(_backend) {
    // noop
  },
  disconnect() {
    // noop
  },
  render(_drawable) {
    // noop
  },
};
void missingFlush;

// `RenderBackendType` stays a real (value-usable) closed vocabulary, not widened to string.
const backendTypeValue: RenderBackendType = RenderBackendType.WebGpu;
void backendTypeValue;
// @ts-expect-error — not a member of the closed RenderBackendType vocabulary.
const looseBackendType: RenderBackendType = 'vulkan';
void looseBackendType;

export { gl2Registry };
