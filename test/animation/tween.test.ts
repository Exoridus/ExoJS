import { Tween } from '@/animation/Tween';
import { TweenManager } from '@/animation/TweenManager';
import { TweenState } from '@/animation/types';
import { Ease } from '@/animation/Easing';

// Minimal sprite-like target.
const makeSprite = (x = 0, y = 0, alpha = 1) => ({ x, y, alpha });

describe('Tween', () => {
    describe('initial state', () => {
        test('new tween is Idle', () => {
            const tween = new Tween(makeSprite());
            expect(tween.state).toBe(TweenState.Idle);
        });

        test('start() transitions state to Active', () => {
            const tween = new Tween(makeSprite()).to({ x: 100 }, 1.0).start();
            expect(tween.state).toBe(TweenState.Active);
        });
    });

    describe('basic interpolation', () => {
        test('x is approximately 50 at t=0.5 with linear easing', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.update(0.5);
            expect(sprite.x).toBeCloseTo(50, 10);
        });

        test('x === 100 exactly after full duration; state is Complete', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.update(0.5);
            tween.update(0.5);
            expect(sprite.x).toBe(100);
            expect(tween.state).toBe(TweenState.Complete);
        });

        test('onComplete fires when tween finishes naturally', () => {
            const sprite = makeSprite();
            const onComplete = jest.fn();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).onComplete(onComplete).start();

            tween.update(1.0);
            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });

    describe('multiple properties', () => {
        test('x, y, alpha all interpolate in lockstep', () => {
            const sprite = makeSprite(0, 0, 0);
            const tween = new Tween(sprite).to({ x: 100, y: 200, alpha: 0.5 }, 1.0).start();

            tween.update(0.5);
            expect(sprite.x).toBeCloseTo(50, 10);
            expect(sprite.y).toBeCloseTo(100, 10);
            expect(sprite.alpha).toBeCloseTo(0.25, 10);
        });
    });

    describe('delay', () => {
        test('progress does not advance during delay', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).start();

            tween.update(0.3);
            expect(sprite.x).toBe(0); // still in delay
        });

        test('onStart fires after delay, not before', () => {
            const sprite = makeSprite();
            const onStart = jest.fn();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).onStart(onStart).start();

            tween.update(0.4);
            expect(onStart).not.toHaveBeenCalled();

            tween.update(0.2); // total 0.6s — past delay
            expect(onStart).toHaveBeenCalledTimes(1);
        });

        test('overflow past delay is applied to progress', () => {
            const sprite = makeSprite();
            // delay 0.5s, duration 1.0s; after 1.0s total: 0.5s into tween
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).delay(0.5).start();

            tween.update(1.0);
            expect(sprite.x).toBeCloseTo(50, 5);
        });
    });

    describe('easing', () => {
        test('quadOut produces non-linear progression at t=0.5', () => {
            const spriteLinear = makeSprite();
            const tweenLinear = new Tween(spriteLinear).to({ x: 100 }, 1.0).easing(Ease.linear).start();
            tweenLinear.update(0.5);

            const spriteQuadOut = makeSprite();
            const tweenQuadOut = new Tween(spriteQuadOut).to({ x: 100 }, 1.0).easing(Ease.quadOut).start();
            tweenQuadOut.update(0.5);

            expect(spriteQuadOut.x).not.toBeCloseTo(spriteLinear.x, 1);
            expect(spriteQuadOut.x).toBeCloseTo(75, 5); // quadOut(0.5) = 0.75
        });
    });

    describe('repeat', () => {
        test('repeat(2): runs 3 cycles total; onRepeat fires twice; onComplete once', () => {
            const sprite = makeSprite();
            const onRepeat = jest.fn();
            const onComplete = jest.fn();
            const tween = new Tween(sprite)
                .to({ x: 100 }, 1.0)
                .repeat(2)
                .onRepeat(onRepeat)
                .onComplete(onComplete)
                .start();

            // Cycle 1
            tween.update(1.0);
            expect(onRepeat).toHaveBeenCalledTimes(1);
            expect(onComplete).toHaveBeenCalledTimes(0);

            // Cycle 2
            tween.update(1.0);
            expect(onRepeat).toHaveBeenCalledTimes(2);
            expect(onComplete).toHaveBeenCalledTimes(0);

            // Cycle 3 (final)
            tween.update(1.0);
            expect(onRepeat).toHaveBeenCalledTimes(2); // no more repeats
            expect(onComplete).toHaveBeenCalledTimes(1);
            expect(tween.state).toBe(TweenState.Complete);
        });

        test('repeat(-1) runs indefinitely — stays Active after 100+ updates', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 0.01).repeat(-1).start();

            for (let i = 0; i < 100; i++) {
                tween.update(0.01);
            }

            expect(tween.state).toBe(TweenState.Active);
        });
    });

    describe('yoyo', () => {
        test('yoyo + repeat(1): cycle 1 forward, cycle 2 backward — x returns to start', () => {
            const sprite = makeSprite(0);
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(1).yoyo().start();

            // End of cycle 1 — x should be at target
            tween.update(1.0);
            expect(sprite.x).toBeCloseTo(100, 5);

            // End of cycle 2 — x should be back at start (reversed)
            tween.update(1.0);
            expect(sprite.x).toBeCloseTo(0, 5);
        });
    });

    describe('pause and resume', () => {
        test('pause() — update() does nothing while paused', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.update(0.3);
            tween.pause();
            const xAfterPause = sprite.x;

            tween.update(0.5);
            expect(sprite.x).toBe(xAfterPause); // no change
            expect(tween.state).toBe(TweenState.Paused);
        });

        test('resume() continues from saved position', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.update(0.3);
            tween.pause();
            tween.resume();
            tween.update(0.7);
            expect(sprite.x).toBeCloseTo(100, 5);
            expect(tween.state).toBe(TweenState.Complete);
        });
    });

    describe('stop', () => {
        test('stop() does not reset target values', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.update(0.5);
            const xBeforeStop = sprite.x;
            tween.stop();
            expect(sprite.x).toBe(xBeforeStop);
        });

        test('stop() sets state to Stopped', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();

            tween.stop();
            expect(tween.state).toBe(TweenState.Stopped);
        });

        test('stop() does not fire onComplete', () => {
            const sprite = makeSprite();
            const onComplete = jest.fn();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).onComplete(onComplete).start();

            tween.stop();
            expect(onComplete).not.toHaveBeenCalled();
        });

        test('update() after stop() is a no-op', () => {
            const sprite = makeSprite();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).start();
            tween.update(0.5);
            tween.stop();
            const xAtStop = sprite.x;

            tween.update(1.0);
            expect(sprite.x).toBe(xAtStop);
        });

        test('stop() removes tween from manager', () => {
            const manager = new TweenManager();
            const sprite = makeSprite();
            const tween = manager.create(sprite).to({ x: 100 }, 1.0).start();

            tween.stop();
            // After stop, updating manager should not move sprite.
            const xAtStop = sprite.x;
            manager.update(1.0);
            expect(sprite.x).toBe(xAtStop);
        });
    });

    describe('chain', () => {
        test('chained tween starts when first completes', () => {
            const sprite = makeSprite();
            const first = new Tween(sprite).to({ x: 100 }, 1.0);
            const second = new Tween(sprite).to({ x: 200 }, 1.0);

            first.chain(second);
            first.start();

            first.update(1.0); // first completes
            expect(second.state).toBe(TweenState.Active);
        });

        test('chained tween does NOT start when first is stopped', () => {
            const sprite = makeSprite();
            const first = new Tween(sprite).to({ x: 100 }, 1.0);
            const second = new Tween(sprite).to({ x: 200 }, 1.0);

            first.chain(second);
            first.start();
            first.stop();

            expect(second.state).toBe(TweenState.Idle);
        });

        test('chain returns next for fluent chaining', () => {
            const sprite = makeSprite();
            const first = new Tween(sprite).to({ x: 100 }, 1.0);
            const second = new Tween(sprite).to({ x: 200 }, 1.0);

            const returned = first.chain(second);
            expect(returned).toBe(second);
        });
    });

    describe('callbacks', () => {
        test('onStart fires once per lifecycle (not per repeat)', () => {
            const sprite = makeSprite();
            const onStart = jest.fn();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).repeat(2).onStart(onStart).start();

            tween.update(1.0); // cycle 1 end
            tween.update(1.0); // cycle 2 end
            tween.update(1.0); // cycle 3 end (complete)
            expect(onStart).toHaveBeenCalledTimes(1);
        });

        test('onUpdate fires each update while active', () => {
            const sprite = makeSprite();
            const onUpdate = jest.fn();
            const tween = new Tween(sprite).to({ x: 100 }, 1.0).onUpdate(onUpdate).start();

            tween.update(0.3);
            tween.update(0.3);
            expect(onUpdate).toHaveBeenCalledTimes(2);
        });
    });

    describe('lazy snapshot', () => {
        test('snapshot captures x at start() time, not at to() time', () => {
            const sprite = makeSprite(0);
            const tween = new Tween(sprite).to({ x: 100 }, 1.0);

            sprite.x = 50; // mutate after to()
            tween.start();  // snapshot should use x=50

            tween.update(0.5);
            // from 50 -> 100 over 1s; at 0.5s: 50 + (100-50)*0.5 = 75
            expect(sprite.x).toBeCloseTo(75, 5);
        });
    });

    describe('non-numeric property warning', () => {
        test('warns and skips non-numeric property', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

            const target = { x: 0, label: 'hello' };
            const tween = new Tween(target).to({ x: 100, label: 999 } as never, 1.0).start();

            tween.update(0.5);
            expect(warnSpy).toHaveBeenCalled();
            expect(target.label).toBe('hello'); // untouched

            warnSpy.mockRestore();
        });
    });
});
