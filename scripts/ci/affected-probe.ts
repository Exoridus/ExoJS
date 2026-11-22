import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { type AffectedPlanDocument, type AffectedRunDocument, assertAffectedPlanCheckout, readAffectedPlan } from './affected-reporter.ts';

const key = (file: { project: string; file: string }): string => JSON.stringify([file.project, file.file]);
const keys = (files: ReadonlyArray<{ project: string; file: string }>): string => JSON.stringify(files.map(key).sort());

/** A diagnostic replay is authorized only by complete successful shadow evidence on this exact tree. */
export const makeAffectedProbe = (
  plan: AffectedPlanDocument,
  audits: readonly AffectedRunDocument[],
  scenario: string,
): AffectedPlanDocument => {
  const selection = plan.selections.find(item => item.name === scenario);

  if (!selection || !selection.inventory.length) {
    throw new Error(`No complete diagnostic scenario named ${scenario}.`);
  }

  const expected = new Set(selection.inventory.map(key));
  const observed = new Set<string>();

  for (const audit of audits) {
    if (
      audit.version !== 1 ||
      audit.head !== plan.head ||
      audit.tree !== plan.tree ||
      audit.base !== plan.base ||
      audit.reason !== 'passed' ||
      audit.unhandledErrors !== 0 ||
      audit.inventoryComplete !== true ||
      audit.inventoryProblems.length !== 0
    ) {
      throw new Error('Diagnostic replay requires successful full-run evidence from the same checkout and range.');
    }

    const proposal = audit.selections.find(item => item.name === scenario);

    if (
      !proposal ||
      proposal.mode !== selection.mode ||
      keys(proposal.inventory) !== keys(selection.inventory) ||
      keys(proposal.tests) !== keys(selection.tests) ||
      proposal.excludedFailures.length !== 0 ||
      keys(audit.inventory) !== keys(audit.files)
    ) {
      throw new Error('The full-run audit did not verify this exact selection without excluded failures.');
    }

    for (const file of audit.files) {
      const identity = key(file);

      if (
        !expected.has(identity) ||
        observed.has(identity) ||
        !file.completed ||
        !['passed', 'skipped'].includes(file.state) ||
        file.counts.failed !== 0 ||
        file.counts.pending !== 0
      ) {
        throw new Error(`Invalid or incomplete full-run observation: ${identity}.`);
      }

      observed.add(identity);
    }
  }

  if (observed.size !== expected.size) {
    throw new Error('The successful full-run evidence does not cover the complete scenario inventory.');
  }

  return { ...plan, selections: [{ ...selection, name: 'change' }] };
};

const main = (): void => {
  const { values } = parseArgs({
    options: { plan: { type: 'string' }, results: { type: 'string' }, scenario: { type: 'string' }, output: { type: 'string' } },
    allowPositionals: false,
  });

  if (!values.plan || !values.results || !values.scenario || !values.output) {
    throw new Error('Provide --plan, --results, --scenario and a new --output path.');
  }

  const root = process.cwd();
  const plan = readAffectedPlan(values.plan, root);
  assertAffectedPlanCheckout(plan, root, true);
  const results = resolve(values.results);
  const audits = readdirSync(results)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(resolve(results, file), 'utf8')) as AffectedRunDocument);
  const probe = makeAffectedProbe(plan, audits, values.scenario);
  const output = resolve(values.output);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(probe, null, 2)}\n`, { flag: 'wx' });
  const selection = probe.selections[0]!;
  console.log(`affected-probe: diagnostic ${values.scenario}; ${selection.tests.length}/${selection.inventory.length} files`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
