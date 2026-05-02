import { capabilities, isSupported } from '@/core/capabilities';
import type { CapabilityName } from '@/core/capabilities';

describe('capabilities', () => {
    test('is a frozen object', () => {
        expect(Object.isFrozen(capabilities)).toBe(true);
    });

    test('exposes the documented set of probes as booleans', () => {
        const expected: ReadonlyArray<CapabilityName> = [
            'webgl2',
            'webgpu',
            'audio',
            'pointer',
            'touch',
            'gamepad',
            'keyboard',
            'fullscreen',
            'vibration',
            'offscreenCanvas',
        ];

        for (const name of expected) {
            expect(typeof capabilities[name]).toBe('boolean');
        }

        expect(Object.keys(capabilities).sort()).toEqual([...expected].sort());
    });

    test('jsdom baseline: WebGPU is never reported in the test env', () => {
        // jsdom does not implement WebGPU. If this ever flips it's worth
        // a deliberate look — either jsdom upgraded or our probe regressed.
        expect(capabilities.webgpu).toBe(false);
    });

    test('isSupported returns the same value as direct property access', () => {
        const names: ReadonlyArray<CapabilityName> = [
            'webgl2',
            'webgpu',
            'audio',
            'pointer',
            'touch',
            'gamepad',
            'keyboard',
            'fullscreen',
            'vibration',
            'offscreenCanvas',
        ];

        for (const name of names) {
            expect(isSupported(name)).toBe(capabilities[name]);
        }
    });
});
