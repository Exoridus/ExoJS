import assert from 'node:assert/strict';

import type { Loader } from '../src/assets/Loader';
import { LoaderScope } from '../src/assets/LoaderScope';
import { Scene } from '../src/core/scene/Scene';

// Exercise the real scope implementation. The stub observes the ownership
// boundary without introducing network, image decoding, or GPU behavior.
const owners = new Set<LoaderScope>();
const loader = {
  _getClaimed(owner: LoaderScope): object {
    owners.add(owner);
    return {};
  },
  _releaseScope(owner: LoaderScope): void {
    owners.delete(owner);
  },
} as unknown as Loader;

const parent = new LoaderScope(loader, 'scope', 'ended-parent');
parent.destroy();
assert.throws(() => parent.get('image/probe.png'), /destroyed scope/);

const child = parent.createScope({ name: 'created-after-parent-end' });
child.get('image/probe.png');
assert.equal(owners.size, 1);
parent.destroy();
assert.equal(owners.size, 1);
child.destroy();
assert.equal(owners.size, 0);
console.log('REPRODUCED DOC-IMPL-001: createScope after parent destruction permits a child claim that repeated parent destruction does not release.');

class PrematureSceneAccess extends Scene {
  readonly premature = this.app;
}
assert.throws(() => new PrematureSceneAccess());
console.log('REPRODUCED DOC-CORRECTION-001: accessing Scene.app in a class field initializer throws before attachment.');
