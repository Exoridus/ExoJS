import { beforeEach, describe, expect, it } from 'vitest';
import { buildExampleHref, readUrlState } from '../../site/src/lib/url-state';

describe('site playground URL state', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/en/playground/');
    });

    it('parses chapter/slug query examples and restores the .js suffix', () => {
        window.history.replaceState(null, '', '/en/playground/?version=current&example=debug-layer/performance-overlay');

        expect(readUrlState()).toEqual({
            version: 'current',
            example: 'debug-layer/performance-overlay.js',
        });
    });

    it('parses encoded chapter/slug query examples', () => {
        window.history.replaceState(null, '', '/en/playground/?example=render-targets%2Fpost-processing-chain');

        expect(readUrlState()).toEqual({
            version: null,
            example: 'render-targets/post-processing-chain.js',
        });
    });

    it('builds hash hrefs without encoding slashes in the example path', () => {
        expect(buildExampleHref('debug-layer/performance-overlay.js', 'current')).toBe('#/current/debug-layer/performance-overlay');
    });
});
