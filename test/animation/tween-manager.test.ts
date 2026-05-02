import { TweenManager } from '@/animation/TweenManager';
import { Tween } from '@/animation/Tween';
import { TweenState } from '@/animation/types';

const makeTarget = () => ({ x: 0, y: 0 });

describe('TweenManager', () => {
    test('create() returns a Tween bound to the manager', () => {
        const manager = new TweenManager();
        const target = makeTarget();
        const tween = manager.create(target);

        expect(tween).toBeInstanceOf(Tween);
        expect(tween.target).toBe(target);
    });

    test('update() advances all active tweens', () => {
        const manager = new TweenManager();
        const a = makeTarget();
        const b = makeTarget();

        manager.create(a).to({ x: 100 }, 1.0).start();
        manager.create(b).to({ x: 200 }, 1.0).start();

        manager.update(0.5);
        expect(a.x).toBeCloseTo(50, 5);
        expect(b.x).toBeCloseTo(100, 5);
    });

    test('completed tween self-removes from manager', () => {
        const manager = new TweenManager();
        const target = makeTarget();
        const tween = manager.create(target).to({ x: 100 }, 1.0).start();

        manager.update(1.0); // completes
        expect(tween.state).toBe(TweenState.Complete);

        // Further updates should not error and target should stay at 100
        manager.update(1.0);
        expect(target.x).toBe(100);
    });

    test('add() registers a stand-alone Tween', () => {
        const manager = new TweenManager();
        const target = makeTarget();
        const tween = new Tween(target).to({ x: 100 }, 1.0).start();

        manager.add(tween);
        manager.update(0.5);
        expect(target.x).toBeCloseTo(50, 5);
    });

    test('add() does not double-register a tween', () => {
        const manager = new TweenManager();
        const target = makeTarget();
        const tween = manager.create(target).to({ x: 100 }, 1.0).start();

        manager.add(tween); // add again
        manager.update(1.0); // should complete once, not advance twice
        expect(target.x).toBe(100);
        expect(tween.state).toBe(TweenState.Complete);
    });

    test('remove() evicts a tween; subsequent updates skip it', () => {
        const manager = new TweenManager();
        const target = makeTarget();
        const tween = manager.create(target).to({ x: 100 }, 1.0).start();

        manager.update(0.3);
        manager.remove(tween);
        manager.update(0.7);
        expect(target.x).toBeCloseTo(30, 5); // frozen at 0.3s
    });

    test('clear() removes all tweens without firing onComplete', () => {
        const manager = new TweenManager();
        const onComplete = jest.fn();

        manager.create(makeTarget()).to({ x: 100 }, 1.0).onComplete(onComplete).start();
        manager.create(makeTarget()).to({ x: 200 }, 1.0).onComplete(onComplete).start();

        manager.clear();
        manager.update(1.0); // no tweens remain — nothing should fire
        expect(onComplete).not.toHaveBeenCalled();
    });

    test('destroy() makes subsequent update() calls no-ops', () => {
        const manager = new TweenManager();
        const target = makeTarget();

        manager.create(target).to({ x: 100 }, 1.0).start();
        manager.destroy();
        manager.update(1.0);
        expect(target.x).toBe(0); // never advanced
    });

    test('iteration snapshot: onComplete callback may add new tweens without crashing', () => {
        const manager = new TweenManager();
        const a = makeTarget();
        const b = makeTarget();

        const tweenA = manager.create(a).to({ x: 100 }, 1.0).start();
        tweenA.onComplete(() => {
            // Add a new tween from within an onComplete callback.
            manager.create(b).to({ x: 200 }, 1.0).start();
        });

        expect(() => manager.update(1.0)).not.toThrow();
        expect(tweenA.state).toBe(TweenState.Complete);
    });
});
