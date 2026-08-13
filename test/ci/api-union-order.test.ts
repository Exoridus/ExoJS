import { describe, expect, it } from 'vitest';

import { sortUnionMembers } from '../../site/scripts/sort-union-members';

describe('API documentation union ordering', () => {
  it('sorts by rendered member text without mutating TypeDoc input order', () => {
    const members = [{ text: '0' }, { text: '2' }, { text: '1' }, { text: '3' }];

    const sorted = sortUnionMembers(members, member => member.text);

    expect(sorted.map(member => member.text)).toEqual(['0', '1', '2', '3']);
    expect(members.map(member => member.text)).toEqual(['0', '2', '1', '3']);
  });

  it('orders nested rendered types deterministically', () => {
    const members = ['string[]', 'AssetRef<Texture>', 'null', 'AssetRef<Sound>'];

    expect(sortUnionMembers(members, member => member)).toEqual(['AssetRef<Sound>', 'AssetRef<Texture>', 'null', 'string[]']);
  });
});
