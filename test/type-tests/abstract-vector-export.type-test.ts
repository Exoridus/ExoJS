import type { AbstractVector, ObservableVector, Vector } from '../../src/index';

// The base class named by the public `position`/`origin`/`anchor` setters is
// itself nameable, and both concrete vector kinds are assignable to it.
const fromVector: AbstractVector = {} as Vector;
const fromObservable: AbstractVector = {} as ObservableVector;

export { fromObservable, fromVector };
