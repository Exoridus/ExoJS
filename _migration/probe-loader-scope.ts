import assert from 'node:assert/strict';

import type { Loader } from '../src/assets/Loader';
import { LoaderScope } from '../src/assets/LoaderScope';

// Observe the real ownership implementation without network or GPU setup.
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
console.log('REPRODUCED DOC-IMPL-001: a child created after parent destruction can retain a claim that repeated parent destruction does not release.');
