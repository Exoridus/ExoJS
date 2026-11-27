/** Independent CI runners partition whole groups; checks within a group share state. */
export const PLAYGROUND_SUITES = ['shell', 'rendering', 'lifecycle', 'assets'] as const;

export type PlaygroundSuite = (typeof PLAYGROUND_SUITES)[number];

// Preserve the original full-run order, including the asset/snippet dependency.
const GROUPS = [
  { name: 'file-tabs', suite: 'shell' },
  { name: 'reliability', suite: 'shell' },
  { name: 'header', suite: 'shell' },
  { name: 'native-controls', suite: 'shell' },
  { name: 'responsive-preview', suite: 'shell' },
  { name: 'crt', suite: 'rendering' },
  { name: 'mask', suite: 'rendering' },
  { name: 'audio-bus', suite: 'lifecycle' },
  { name: 'worker', suite: 'rendering' },
  { name: 'new-tab', suite: 'shell' },
  { name: 'example-lifecycle', suite: 'lifecycle' },
  { name: 'console', suite: 'shell' },
  { name: 'widget-lab', suite: 'shell' },
  { name: 'assets', suite: 'assets' },
] as const satisfies ReadonlyArray<{ name: string; suite: PlaygroundSuite }>;

export type PlaygroundGroup = (typeof GROUPS)[number]['name'];

/** The existing --only option still filters individual check names in the harness. */
export const selectPlaygroundGroups = (suite?: string, only?: string): PlaygroundGroup[] => {
  if (suite !== undefined && !PLAYGROUND_SUITES.some(candidate => candidate === suite)) {
    throw new Error(`Unknown Playground suite: ${suite}. Expected ${PLAYGROUND_SUITES.join(', ')}.`);
  }

  // Keep the original asset diagnostic shortcut, including Widget Lab setup.
  const assetOnly = only?.toLowerCase() === 'asset' || only?.toLowerCase().includes('asset browser');

  return GROUPS.filter(group => suite === undefined || group.suite === suite)
    .filter(group => !assetOnly || group.name === 'widget-lab' || group.name === 'assets')
    .map(group => group.name);
};

/** Run groups serially so no shared browser state is exercised concurrently. */
export const runPlaygroundGroups = async (
  groups: readonly PlaygroundGroup[],
  handlers: Readonly<Record<PlaygroundGroup, () => Promise<void>>>,
): Promise<void> => {
  for (const group of groups) {
    await handlers[group]();
  }
};

/** Explicit suites are CI contracts; --only without a suite remains a diagnostic. */
export const assertPlaygroundSuiteResults = (suite: string | undefined, checks: number): void => {
  if (suite !== undefined && checks === 0) {
    throw new Error(`Playground suite ${suite} matched no checks. Check the --only filter.`);
  }
};
