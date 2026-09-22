import { parseArgList, parseArgs } from '../src/shared/args';

/**
 * `bench:compare` takes one `--rendering` / `--physics` path per benchmark run,
 * so a repeated flag has to keep every value it was given. A parser that kept
 * only the last would silently publish a one-run profile from a three-run
 * command line.
 */

describe('parseArgs', () => {
  test('reads both the joined and the separated form of a flag', () => {
    const args = parseArgs(['--out=a.md', '--profile', 'b/', '--flag']);

    expect(args.get('out')).toBe('a.md');
    expect(args.get('profile')).toBe('b/');
    expect(args.get('flag')).toBe('true');
  });

  test('keeps the last value of a repeated flag, which is what a single-valued flag wants', () => {
    expect(parseArgs(['--out=a.md', '--out=b.md']).get('out')).toBe('b.md');
  });
});

describe('parseArgList', () => {
  test('collects every value of a repeated flag, in the order given', () => {
    expect(parseArgList(['--rendering=1.json', '--physics', 'p.json', '--rendering', '2.json'], 'rendering')).toEqual(['1.json', '2.json']);
  });

  test('a single occurrence yields a single value, so one path behaves as it always did', () => {
    expect(parseArgList(['--rendering=only.json'], 'rendering')).toEqual(['only.json']);
  });

  test('an absent flag yields nothing rather than an empty-string path', () => {
    expect(parseArgList(['--rendering=only.json'], 'physics')).toEqual([]);
  });

  test('takes a value whole, so a path containing a comma survives', () => {
    expect(parseArgList(['--rendering=C:/runs/a,b/results.json'], 'rendering')).toEqual(['C:/runs/a,b/results.json']);
  });
});
