// Type contract for the synchronous engine hooks: `Scene.init` and the frame
// hooks (`fixedUpdate`/`update`/`draw`), plus the three `SystemMethods`
// phases, reject an `async` override at compile time — a plain `void` return
// type does NOT, because TypeScript makes a `void`-returning signature
// assignable from a signature returning anything at all.
//
// `Scene.load`/`Scene.unload` are the hooks the engine genuinely awaits and
// must stay asynchronous; the bottom half pins that down so the prohibition
// can never be widened onto them by accident.
//
// Compiled by `tsconfig.type-tests.json` and `tsconfig.type-tests-loose.json`
// (`strictNullChecks: false`) via `pnpm typecheck:type-tests`.

import { type RenderingContext, Scene, type Synchronous, type System, type Time } from '@codexo/exojs';

// ── Scene: synchronous overrides are accepted, exactly as before ────────────

class SyncScene extends Scene {
  public override init(): void {
    // noop
  }

  public override fixedUpdate(_step: Time): void {
    // noop
  }

  public override update(_delta: Time): void {
    // noop
  }

  public override draw(_context: RenderingContext): void {
    // noop
  }
}
void SyncScene;

// An unannotated override infers `void` and is accepted too.
class InferredSyncScene extends Scene {
  public override update(_delta: Time) {
    // noop
  }
}
void InferredSyncScene;

// The hook return type is nameable, for code that wants to be explicit.
class ExplicitSyncScene extends Scene {
  public override update(_delta: Time): Synchronous {
    // noop
  }
}
void ExplicitSyncScene;

// Only thenables are banned — the engine's fluent `update(delta): this`
// convention (Application, SceneDirector, AnimatedSprite, ParticleSystem, …)
// must keep compiling, so a non-thenable return stays legal.
class FluentScene extends Scene {
  public override update(_delta: Time): this {
    return this;
  }
}
void FluentScene;

// ── Scene: async overrides are rejected ────────────────────────────────────

class AsyncInitScene extends Scene {
  // @ts-expect-error — init() must be synchronous; move async setup into load().
  public override async init(): Promise<void> {
    await Promise.resolve();
  }
}
void AsyncInitScene;

class AsyncFixedUpdateScene extends Scene {
  // @ts-expect-error — fixedUpdate() must be synchronous.
  public override async fixedUpdate(_step: Time): Promise<void> {
    await Promise.resolve();
  }
}
void AsyncFixedUpdateScene;

class AsyncUpdateScene extends Scene {
  // @ts-expect-error — update() must be synchronous.
  public override async update(_delta: Time): Promise<void> {
    await Promise.resolve();
  }
}
void AsyncUpdateScene;

class AsyncDrawScene extends Scene {
  // @ts-expect-error — draw() must be synchronous.
  public override async draw(_context: RenderingContext): Promise<void> {
    await Promise.resolve();
  }
}
void AsyncDrawScene;

// An `async` override with an inferred return type is rejected as well — the
// mistake is almost always written without the explicit `Promise<void>`.
class InferredAsyncUpdateScene extends Scene {
  // @ts-expect-error — update() must be synchronous.
  public override async update(_delta: Time) {
    await Promise.resolve();
  }
}
void InferredAsyncUpdateScene;

// Returning a Promise without `async` is the same violation.
class ThenableUpdateScene extends Scene {
  // @ts-expect-error — update() must not return a Promise.
  public override update(_delta: Time): Promise<void> {
    return Promise.resolve();
  }
}
void ThenableUpdateScene;

// A hand-rolled thenable is rejected too — the ban is on the `then` protocol,
// not on the `Promise` class, which matches what the runtime guard detects.
class CustomThenable {
  public then(_onFulfilled: () => void): void {
    // noop
  }
}

class CustomThenableScene extends Scene {
  // @ts-expect-error — update() must not return a thenable of any kind.
  public override update(_delta: Time): CustomThenable {
    return new CustomThenable();
  }
}
void CustomThenableScene;

// ── System phases ──────────────────────────────────────────────────────────

const syncSystem: System = {
  update(_delta) {
    // noop
  },
};
void syncSystem;

const asyncUpdateSystem: System = {
  // @ts-expect-error — a System's update() phase must be synchronous.
  async update(_delta) {
    await Promise.resolve();
  },
};
void asyncUpdateSystem;

const asyncFixedUpdateSystem: System = {
  // @ts-expect-error — a System's fixedUpdate() phase must be synchronous.
  async fixedUpdate(_step) {
    await Promise.resolve();
  },
};
void asyncFixedUpdateSystem;

const asyncDrawSystem: System = {
  // @ts-expect-error — a System's draw() phase must be synchronous.
  async draw(_context) {
    await Promise.resolve();
  },
};
void asyncDrawSystem;

class AsyncSystemClass {
  public async update(_delta: Time): Promise<void> {
    await Promise.resolve();
  }
}

// @ts-expect-error — a class-based System's phase must be synchronous too.
const asyncSystemInstance: System = new AsyncSystemClass();
void asyncSystemInstance;

// ── load()/unload() stay asynchronous ──────────────────────────────────────

class AsyncLoadScene extends Scene<{ readonly level: number }> {
  public override async load(data: Readonly<{ readonly level: number }>): Promise<void> {
    await Promise.resolve(data.level);
  }

  public override async unload(): Promise<void> {
    await Promise.resolve();
  }
}
void AsyncLoadScene;

// A synchronous load()/unload() remains valid — the hooks are `Promise<void> | void`.
class SyncLoadScene extends Scene {
  public override load(): void {
    // noop
  }

  public override unload(): void {
    // noop
  }
}
void SyncLoadScene;
