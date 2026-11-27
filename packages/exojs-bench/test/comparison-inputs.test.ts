import { readComparisonInputs } from '../src/comparison/inputs';

/**
 * A profile pools one results file per run. A path the command line names but
 * no flag claims would otherwise drop out without a word, and the profile would
 * pool fewer runs than the command appears to ask for.
 */

describe('readComparisonInputs', () => {
  test('collects one path per repeated flag, per domain, in run order', () => {
    expect(
      readComparisonInputs(['--rendering', 'r1.json', '--rendering=r2.json', '--physics', 'p1.json', '--physics', 'p2.json', '--profile']),
    ).toEqual({ renderingPaths: ['r1.json', 'r2.json'], physicsPaths: ['p1.json', 'p2.json'] });
  });

  test('rejects paths listed after a single flag instead of pooling only the first', () => {
    expect(() => readComparisonInputs(['--rendering', 'r1.json', 'r2.json', 'r3.json', '--physics', 'p1.json'])).toThrow(
      /'r2\.json', 'r3\.json'.*--rendering/s,
    );
  });

  test('rejects a command line that names no results file', () => {
    expect(() => readComparisonInputs(['--profile'])).toThrow(/Nothing to compare/);
  });
});
