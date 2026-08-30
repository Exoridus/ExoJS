/**
 * Measures whether each rule relaxation in the ESLint config still earns its
 * place, by putting the rule back and counting what breaks.
 *
 * A flat-config block that turns a rule off is a claim: *this rule is wrong for
 * these files*. The claim ages badly. The code that needed it gets rewritten,
 * the rule's own implementation gets smarter, the files move - and the block
 * stays, now suppressing nothing, or suppressing two violations that would be
 * better as two inline comments naming their reason.
 *
 * For every `off` entry in a `files`-scoped block, this re-lints exactly the
 * files that block matches with that one rule forced back to `error`, and
 * reports the count. Three outcomes, three different actions:
 *
 * - **0** - the relaxation is dead. Delete it.
 * - **1-3** - the relaxation is too broad for what it holds back. An inline
 *   `eslint-disable-next-line` at each site says *why*, where a reader is.
 * - **many** - the relaxation is doing real work. Keep it, and make sure the
 *   block carries a comment saying what it buys.
 *
 * Two kinds of entry are reported but need no judgement, and reading a run means
 * recognising them first. A vendor preset spread into the config (`eslintRecommended`,
 * `disableTypeChecked`) shows up as dozens of `off` entries in one block: those
 * are not decisions taken here, and their counts are meaningless - `no-undef`
 * "fires" thousands of times in TypeScript by design. And a type-aware rule
 * relaxed where its parser project is switched off cannot be measured at all,
 * which is itself the answer: the rule could never have fired there.
 *
 * This is an audit, not a gate: the counts are input to a judgement about each
 * relaxation, and no threshold is right for all of them. It is also slow - one
 * ESLint pass per relaxation - so it runs on request.
 *
 * `pnpm lint:overrides:audit [ruleFilter]` - with an argument, only relaxations
 * whose rule id contains it are measured.
 */
import { ESLint } from 'eslint';

import config from '../eslint.config.ts';

interface Relaxation {
  readonly rule: string;
  readonly files: readonly string[];
  /** Index of the config block, so two blocks relaxing the same rule stay distinguishable. */
  readonly block: number;
}

const OFF_VALUES = new Set(['off', 0]);

const collectRelaxations = (): Relaxation[] => {
  const found: Relaxation[] = [];

  (config as readonly { files?: unknown; rules?: Record<string, unknown> }[]).forEach((block, index) => {
    const { files, rules } = block;

    if (files === undefined || rules === undefined) return;

    const patterns = (Array.isArray(files) ? files : [files]).flat().filter((entry): entry is string => typeof entry === 'string');

    if (patterns.length === 0) return;

    for (const [rule, setting] of Object.entries(rules)) {
      const severity = Array.isArray(setting) ? setting[0] : setting;

      if (OFF_VALUES.has(severity as string | number)) found.push({ block: index, files: patterns, rule });
    }
  });

  return found;
};

/** Violations of `rule` across `patterns`, with that rule forced back on. */
const countViolations = async (relaxation: Relaxation): Promise<number | string> => {
  const eslint = new ESLint({
    // The relaxation is reinstated as an override applied last, so it wins over
    // the block under test without the rest of the config changing.
    overrideConfig: [{ files: [...relaxation.files], rules: { [relaxation.rule]: 'error' } }],
    // Every other rule is silenced: the question is what THIS relaxation holds
    // back, not what else the file happens to violate.
    ruleFilter: ({ ruleId }) => ruleId === relaxation.rule,
    // A block may name a pattern that matches nothing today; that is the
    // config-path gate's business, not a reason to abort the audit.
    errorOnUnmatchedPattern: false,
  });

  try {
    const results = await eslint.lintFiles([...relaxation.files]);

    // Only violations of the rule under test count. A lint run also emits
    // messages of its own - an unresolvable rule id in a stray config, a parse
    // error - and counting those would credit a relaxation with holding back
    // something it has nothing to do with.
    return results.reduce((total, result) => total + result.messages.filter(message => message.ruleId === relaxation.rule).length, 0);
  } catch (error) {
    if (!(error instanceof Error)) return 'not measured';

    // A type-aware rule needs a parser project covering the linted file. Where
    // none does, the relaxation is theoretical: the rule could not have fired
    // on those files even with the block removed.
    if (error.message.includes('requires type information')) return 'no type-aware project covers these files';

    return error.message.split('\n')[0];
  }
};

const main = async (): Promise<void> => {
  const filter = process.argv[2];
  const relaxations = collectRelaxations().filter(entry => filter === undefined || entry.rule.includes(filter));

  console.log(`Measuring ${relaxations.length} rule relaxation(s)${filter === undefined ? '' : ` matching '${filter}'`}...\n`);

  const rows: { relaxation: Relaxation; count: number | string }[] = [];

  for (const relaxation of relaxations) {
    rows.push({ count: await countViolations(relaxation), relaxation });
  }

  const dead = rows.filter(row => row.count === 0);
  const narrow = rows.filter(row => typeof row.count === 'number' && row.count > 0 && row.count <= 3);
  const earned = rows.filter(row => typeof row.count === 'number' && row.count > 3);
  const skipped = rows.filter(row => typeof row.count === 'string');

  const report = (label: string, entries: typeof rows): void => {
    if (entries.length === 0) return;

    console.log(`${label} (${entries.length}):`);

    for (const { count, relaxation } of entries) {
      console.log(`  ${String(count).padStart(5)}  ${relaxation.rule}  [block ${relaxation.block}]  ${relaxation.files.join(', ')}`);
    }

    console.log('');
  };

  report('DEAD - suppresses nothing, delete the entry', dead);
  report('NARROW - an inline disable with a reason would say more', narrow);
  report('EARNED - keep, and document what it buys', earned);
  report('NOT MEASURED - see the reason on each line', skipped);

  console.log(`${rows.length} measured: ${dead.length} dead, ${narrow.length} narrow, ${earned.length} earned, ${skipped.length} skipped.`);
};

await main();
