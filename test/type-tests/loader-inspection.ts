import { type AssetInspection,Loader } from '../../src/index';

const loader = new Loader();
const snapshot: readonly AssetInspection[] = loader.inspect();
const state: AssetInspection['state'] | undefined = snapshot[0]?.state;
void state;

// @ts-expect-error inspect() returns a readonly array.
snapshot.push({} as AssetInspection);
if (snapshot[0] !== undefined) {
  // @ts-expect-error inspection rows are readonly snapshots.
  snapshot[0].state = 'ready';
}
