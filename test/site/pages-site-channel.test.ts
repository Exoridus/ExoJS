import { describe, expect, it } from 'vitest';

import {
  channelForBranch,
  counterpartBasePath,
  isSafeBasePath,
  resolveSiteChannel,
  SITE_CHANNEL_BASE,
  siteChannelOutputs,
} from '../../scripts/pages/site-channel';

/**
 * The channel build contract: `EXOJS_SITE_CHANNEL` and `EXOJS_SITE_BASE`
 * decide the base path every generated URL carries, so an invalid or
 * contradictory pair must never reach a build.
 */

describe('resolveSiteChannel', () => {
  it('keeps the stable site at /ExoJS/ when nothing is configured', () => {
    expect(resolveSiteChannel({})).toEqual({ channel: 'stable', basePath: '/ExoJS/', localTest: false });
  });

  it('derives the canonical base from the channel', () => {
    expect(resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next' })).toEqual({ channel: 'next', basePath: '/ExoJS/next/', localTest: false });
    expect(resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'stable' }).basePath).toBe('/ExoJS/');
  });

  it('accepts the canonical pairs and infers the channel from a canonical base', () => {
    expect(resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next', EXOJS_SITE_BASE: '/ExoJS/next/' }).channel).toBe('next');
    expect(resolveSiteChannel({ EXOJS_SITE_BASE: '/ExoJS/next/' }).channel).toBe('next');
    expect(resolveSiteChannel({ EXOJS_SITE_BASE: '/ExoJS/' }).channel).toBe('stable');
  });

  it('treats empty values as unset', () => {
    expect(resolveSiteChannel({ EXOJS_SITE_CHANNEL: '', EXOJS_SITE_BASE: '' }).channel).toBe('stable');
  });

  it('rejects an unknown channel', () => {
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'beta' })).toThrow(/EXOJS_SITE_CHANNEL/);
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'Next' })).toThrow(/EXOJS_SITE_CHANNEL/);
  });

  it('rejects a contradictory channel/base pair', () => {
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'stable', EXOJS_SITE_BASE: '/ExoJS/next/' })).toThrow(/contradicts/);
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next', EXOJS_SITE_BASE: '/ExoJS/' })).toThrow(/contradicts/);
  });

  it('rejects a non-canonical base outside local test mode', () => {
    expect(() => resolveSiteChannel({ EXOJS_SITE_BASE: '/preview/' })).toThrow(/EXOJS_SITE_LOCAL_TEST/);
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next', EXOJS_SITE_BASE: '/ExoJS/next' })).toThrow();
  });

  it('allows a safe custom base only in explicit local test mode, and never on CI', () => {
    expect(resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next', EXOJS_SITE_BASE: '/sandbox/next/', EXOJS_SITE_LOCAL_TEST: '1' })).toEqual({
      channel: 'next',
      basePath: '/sandbox/next/',
      localTest: true,
    });
    expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'next', EXOJS_SITE_BASE: '/sandbox/', EXOJS_SITE_LOCAL_TEST: '1', GITHUB_ACTIONS: 'true' })).toThrow(
      /CI/,
    );
    expect(() => resolveSiteChannel({ EXOJS_SITE_BASE: '/sandbox/', EXOJS_SITE_LOCAL_TEST: '1' })).toThrow(/EXOJS_SITE_CHANNEL/);
  });

  it('rejects an unsafe base even in local test mode', () => {
    for (const base of ['/a/../b/', '/a//b/', 'relative/', '/a b/', '/a/"x/', "/a/'/", '/a/<x>/', '/a/$(id)/', '//evil.example/', '/a/./']) {
      expect(() => resolveSiteChannel({ EXOJS_SITE_CHANNEL: 'stable', EXOJS_SITE_BASE: base, EXOJS_SITE_LOCAL_TEST: '1' }), `${base}`).toThrow();
    }
  });
});

describe('isSafeBasePath', () => {
  it('accepts the canonical bases and the root', () => {
    expect(isSafeBasePath('/')).toBe(true);
    expect(isSafeBasePath(SITE_CHANNEL_BASE.stable)).toBe(true);
    expect(isSafeBasePath(SITE_CHANNEL_BASE.next)).toBe(true);
  });

  it('refuses a base without both slashes', () => {
    expect(isSafeBasePath('/ExoJS')).toBe(false);
    expect(isSafeBasePath('ExoJS/')).toBe(false);
    expect(isSafeBasePath('')).toBe(false);
  });
});

describe('channel relations', () => {
  it('maps the long-lived branches to their channels and nothing else', () => {
    expect(channelForBranch('main')).toBe('stable');
    expect(channelForBranch('next')).toBe('next');
    expect(channelForBranch('feature/x')).toBeNull();
    expect(channelForBranch('refs/heads/main')).toBeNull();
  });

  it('names the other channel as the explicit switch target, but not for a local test base', () => {
    expect(counterpartBasePath({ channel: 'next', basePath: '/ExoJS/next/', localTest: false })).toBe('/ExoJS/');
    expect(counterpartBasePath({ channel: 'stable', basePath: '/ExoJS/', localTest: false })).toBe('/ExoJS/next/');
    expect(counterpartBasePath({ channel: 'next', basePath: '/sandbox/', localTest: true })).toBeNull();
  });
});

describe('siteChannelOutputs', () => {
  it('builds a long-lived branch for its channel', () => {
    expect(siteChannelOutputs('next')).toEqual(['channel=next', 'base=/ExoJS/next/']);
    expect(siteChannelOutputs('main')).toEqual(['channel=stable', 'base=/ExoJS/']);
  });

  it('builds any other ref as stable, the unconfigured default', () => {
    expect(siteChannelOutputs('feature/x')).toEqual(['channel=stable', 'base=/ExoJS/']);
    expect(siteChannelOutputs('')).toEqual(['channel=stable', 'base=/ExoJS/']);
  });
});
