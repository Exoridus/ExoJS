import { describe, expect, it } from 'vitest';

import { LoadState } from '#core/LoadState';

import { _statusFields } from './AssetStatus';

describe('_statusFields', () => {
  it('projects a fresh LoadState as ready with no error', () => {
    const ls = new LoadState<number>();
    expect(_statusFields(ls)).toEqual({ state: 'ready', ready: true, error: null });
  });

  it('projects a loading LoadState as not ready', () => {
    const ls = new LoadState<number>();
    ls.begin();
    expect(_statusFields(ls)).toEqual({ state: 'loading', ready: false, error: null });
  });

  it('projects a failed LoadState with its error', () => {
    const ls = new LoadState<number>();
    ls.begin();
    const err = new Error('boom');
    ls.fail(err);
    expect(_statusFields(ls)).toEqual({ state: 'failed', ready: false, error: err });
  });
});
