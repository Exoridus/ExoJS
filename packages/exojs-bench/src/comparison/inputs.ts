import { parseArgList, unclaimedArgs } from '../shared/args';

/** The results files a comparison pools, one path per measured run. */
export interface ComparisonInputs {
  readonly renderingPaths: string[];
  readonly physicsPaths: string[];
}

/**
 * Resolve the `--rendering` and `--physics` results paths of a `bench:compare`
 * command line.
 *
 * Throws when the command line names no results file, or when it lists a path
 * that no flag claims. Each path needs its own flag, so `--rendering a b c`
 * is refused rather than pooled as the single run `a`.
 */
export const readComparisonInputs = (argv: readonly string[]): ComparisonInputs => {
  const unclaimed = unclaimedArgs(argv);

  if (unclaimed.length > 0) {
    throw new Error(
      `Unexpected argument(s) ${unclaimed.map(token => `'${token}'`).join(', ')}: every results path needs its own flag. ` +
        'Repeat --rendering or --physics once per run, e.g. --rendering run-1/rendering/results.json --rendering run-2/rendering/results.json.',
    );
  }

  const renderingPaths = parseArgList(argv, 'rendering');
  const physicsPaths = parseArgList(argv, 'physics');

  if (renderingPaths.length === 0 && physicsPaths.length === 0) {
    throw new Error(
      'Nothing to compare: pass --rendering and/or --physics pointing at a run results.json. Repeat either flag once per run.',
    );
  }

  return { renderingPaths, physicsPaths };
};
