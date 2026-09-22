export const OUTPUT_MODES = ['auto', 'normal', 'compact', 'silent', 'verbose'] as const;

export type OutputMode = (typeof OUTPUT_MODES)[number];
export type EffectiveOutputMode = Exclude<OutputMode, 'auto'>;

const OUTPUT_RANK: Record<EffectiveOutputMode, number> = {
  silent: 0,
  compact: 1,
  normal: 2,
  verbose: 3,
};

const isOutputMode = (value: string): value is OutputMode => (OUTPUT_MODES as readonly string[]).includes(value);

const invalidMode = (value: string): Error => new Error(`Invalid output mode '${value}'. Expected one of: ${OUTPUT_MODES.join(', ')}.`);

/** Reads the command-line override and removes output flags from the forwarded arguments. */
export const readOutputOptions = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  isTTY = process.stdout.isTTY === true,
): { mode: EffectiveOutputMode; argv: string[] } => {
  const remaining: string[] = [];
  let requested: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--output') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error('--output requires a mode.');
      requested = value;
      index += 1;
    } else if (argument.startsWith('--output=')) {
      requested = argument.slice('--output='.length);
    } else {
      remaining.push(argument);
    }
  }

  const raw = requested ?? env['EXOJS_OUTPUT'] ?? 'auto';
  if (!isOutputMode(raw)) throw invalidMode(raw);

  if (raw !== 'auto') return { mode: raw, argv: remaining };

  const ci = env['CI'] === 'true' || env['CI'] === '1';
  return { mode: ci || !isTTY ? 'compact' : 'normal', argv: remaining };
};

/** Raises a command's mode when a lane must remain visible, such as a benchmark. */
export const atLeastOutputMode = (mode: EffectiveOutputMode, minimum: EffectiveOutputMode): EffectiveOutputMode =>
  OUTPUT_RANK[mode] >= OUTPUT_RANK[minimum] ? mode : minimum;
