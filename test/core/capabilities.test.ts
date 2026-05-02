import { Capabilities } from '@/core/capabilities';

describe('Capabilities', () => {
    test('Capabilities.ready returns the same Promise across calls (memoized)', () => {
        const first = Capabilities.ready;
        const second = Capabilities.ready;

        expect(first).toBe(second);
    });

    test('resolved instance is a Capabilities instance and is frozen', async () => {
        const caps = await Capabilities.ready;

        expect(caps).toBeInstanceOf(Capabilities);
        expect(Object.isFrozen(caps)).toBe(true);
    });

    test('exposes the documented field set with the right primitive types', async () => {
        const caps = await Capabilities.ready;

        expect(typeof caps.webgl2).toBe('boolean');
        expect(typeof caps.webgpu).toBe('boolean');
        expect(typeof caps.pointer).toBe('boolean');
        expect(typeof caps.keyboard).toBe('boolean');
        expect(typeof caps.gamepad).toBe('boolean');
        expect(typeof caps.touch).toBe('boolean');
        expect(typeof caps.audio).toBe('boolean');
        expect(typeof caps.fullscreen).toBe('boolean');
        expect(typeof caps.vibration).toBe('boolean');
        expect(typeof caps.offscreenCanvas).toBe('boolean');
        expect(typeof caps.webWorkers).toBe('boolean');
        expect(typeof caps.maxTouchPoints).toBe('number');
        expect(typeof caps.devicePixelRatio).toBe('number');

        // webgpuAdapter / vendor / architecture are nullable but typed.
        expect(caps.webgpuAdapter === null || typeof caps.webgpuAdapter === 'object').toBe(true);
        expect(caps.webgpuVendor === null || typeof caps.webgpuVendor === 'string').toBe(true);
        expect(caps.webgpuArchitecture === null || typeof caps.webgpuArchitecture === 'string').toBe(true);
    });

    test('jsdom baseline: WebGPU is never reported in the test env', async () => {
        // jsdom does not implement WebGPU. If this ever flips it's worth
        // a deliberate look — either jsdom upgraded or our probe regressed.
        const caps = await Capabilities.ready;

        expect(caps.webgpu).toBe(false);
        expect(caps.webgpuAdapter).toBeNull();
        expect(caps.webgpuVendor).toBeNull();
    });

    test('maxTouchPoints is non-negative', async () => {
        // The two touch indicators aren't strictly tied — jsdom reports
        // `'ontouchstart' in window` as true but `navigator.maxTouchPoints`
        // as 0. We only check non-negativity here.
        const caps = await Capabilities.ready;

        expect(caps.maxTouchPoints).toBeGreaterThanOrEqual(0);
    });

    test('Capabilities cannot be constructed externally via the public API', () => {
        // The constructor is TS-private. Compile-time, `new Capabilities(...)`
        // is rejected. Runtime, TS-private is not enforced, so a cast can
        // still call it — that's not a hard guard, but the documented
        // contract is "use Capabilities.ready".
        const Ctor = Capabilities as unknown as { new(values: unknown): Capabilities };
        expect(() => new Ctor({})).not.toThrow();
    });
});
