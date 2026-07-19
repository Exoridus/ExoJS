// Type contract for the multiphase `System` type (v0.17 core spec §9, slice
// A): at least one of `fixedUpdate`/`update`/`draw` is required, `destroy`
// and `order` are optional, and an object literal passed through
// `SystemRegistry.add()`'s generic inference keeps its own `this`. Compiled
// by `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`.

import { type System, SystemRegistry, type Time } from '@codexo/exojs';

// update-only object literal is accepted.
const updateOnly: System = {
  update(_delta) {
    // noop
  },
};
void updateOnly;

// fixed-only object literal is accepted.
const fixedOnly: System = {
  fixedUpdate(_step) {
    // noop
  },
};
void fixedOnly;

// draw-only object literal is accepted.
const drawOnly: System = {
  draw(_context) {
    // noop
  },
};
void drawOnly;

// an object implementing all three phases is accepted.
const multiPhase: System = {
  fixedUpdate(_step) {
    // noop
  },
  update(_delta) {
    // noop
  },
  draw(_context) {
    // noop
  },
};
void multiPhase;

// `destroy` is optional — accepted both without it (every literal above) and with it.
const withDestroy: System = {
  update(_delta) {
    // noop
  },
  destroy() {
    // noop
  },
};
void withDestroy;

// `order` is optional and accepted alongside any phase.
const withOrder: System = {
  order: 5,
  update(_delta) {
    // noop
  },
};
void withOrder;

// a class instance is accepted, including through SystemRegistry.add — and
// `destroy()` is not required on the class either. `System` is a union (via
// `RequireAtLeastOne`), so a class cannot `implements` it directly — this
// checks the structural assignment instead, which is what `add()` relies on.
class MySystem {
  public update(_delta: Time): void {
    // noop
  }
}

const classInstance: System = new MySystem();
void classInstance;

const registry = new SystemRegistry();
const registered = registry.add(new MySystem());
void registered;

// an object with no phase method is rejected.
// @ts-expect-error — at least one of fixedUpdate/update/draw is required.
const noPhase: System = {
  order: 0,
};
void noPhase;

// object-literal `this` typing is preserved when passed through `add()`'s
// generic inference — the returned value keeps the extra `count` property
// rather than being widened to the bare `System` interface (`satisfies
// System` would trigger excess-property checking against `count` here since
// `System` has no index signature, so inference through `add()` is the
// correct way to observe this guarantee).
const literalWithThis = registry.add({
  count: 0,
  update(_delta) {
    void _delta;
    this.count++;
  },
});
literalWithThis.count = 1;
