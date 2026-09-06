import type { AggregatedPhysics, AggregatedRendering } from './aggregate';
import type { AggregatedCell, AggregatedRow, RunSpread } from './pooled';
import { NOISE_HIGH, NOISE_LOW, STRUCTURAL_FACTOR } from './verdict';

/**
 * Markdown renderer for the published comparison.
 *
 * The document is generated in full, every time: a hand-maintained comparison
 * drifts from the harness, and once it drifts the honesty is gone without anyone
 * noticing. Everything a reader needs to reject the numbers - GPU, driver,
 * software-rasterizer bit, headed/headless, library versions, timer resolution,
 * the count every row was measured at, and how far each number moved between
 * the runs behind it - is in the document itself.
 */

/** Everything the renderer needs about the rendering domain. */
export type RenderingInput = AggregatedRendering;

/** Everything the renderer needs about the physics domain. */
export type PhysicsInput = AggregatedPhysics;

/** Format a millisecond median for the table. */
const ms = (value: number | null): string => (value === null ? 'n/a' : `${value.toFixed(3)} ms`);

/** The observed range behind a published median, as a bracketed suffix. */
const range = (spread: RunSpread): string =>
  Number.isFinite(spread.minMs) && Number.isFinite(spread.maxMs) ? ` [${spread.minMs.toFixed(3)}-${spread.maxMs.toFixed(3)}]` : '';

/**
 * The competitor column: the pooled median, its observed range, and either the
 * verdict or, for a cell the runs disagreed on, what each of them said instead.
 *
 * An unstable cell prints no verdict at all. Publishing the pooled numbers'
 * verdict would state as a result something part of the measurement contradicts,
 * and dropping the row would hide the finding that the cell is not measurable to
 * that resolution on this machine.
 */
const outcome = (cell: AggregatedCell): string => {
  const value = `${ms(cell.competitorMs)}${range(cell.aggregate.competitor)}`;

  return cell.aggregate.stable ? `${value} - ${cell.verdict.label}` : `${value} - ${cell.verdict.label}: ${cell.aggregate.rungs.join(', ')}`;
};

/** One Markdown table row, padded only by the pipes - readers get the alignment from the renderer. */
const tableRow = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;

/** Header plus separator for a table with the given column titles. */
const tableHead = (columns: readonly string[]): string[] => [tableRow(columns), tableRow(columns.map(() => '---'))];

/** Render one comparison row: the reference time and its range, then each competitor's time, range and verdict. */
const renderRow = (row: AggregatedRow, competitors: readonly string[]): string => {
  const reference = row.cells[0];
  const cells: string[] = [`\`${row.archetype}\``, reference === undefined ? 'n/a' : `${ms(reference.referenceMs)}${range(reference.aggregate.reference)}`];

  for (const competitor of competitors) {
    const cell = row.cells.find(candidate => candidate.competitor === competitor);

    cells.push(cell === undefined ? 'not comparable' : outcome(cell));
  }

  cells.push(mechanismCell(row));

  return tableRow(cells);
};

/**
 * The row's mechanism column.
 *
 * Each competitor pair has its own structural comparison, so a row with several
 * competitors can have several mechanisms - and printing only the first would
 * attribute one arm's cause to another arm's number. Identical mechanisms
 * collapse to one sentence; differing ones are printed per competitor.
 */
const mechanismCell = (row: AggregatedRow): string => {
  const evidenced = row.cells.filter((cell): cell is typeof cell & { mechanism: string } => cell.mechanism !== null);

  if (evidenced.length === 0) {
    return 'no structural mechanism evidenced';
  }

  const distinct = new Set(evidenced.map(cell => cell.mechanism));

  if (distinct.size === 1) {
    return evidenced[0]!.mechanism;
  }

  return evidenced.map(cell => `vs ${cell.competitor}: ${cell.mechanism}`).join('; ');
};

/** The ladder and the rules, stated once so a reader can check any verdict by hand. */
const readingRules = (): string[] => [
  '## How to read this',
  '',
  `- Every verdict is computed from the two medians, never authored. A ratio inside ${NOISE_LOW}-${NOISE_HIGH} is called \`level\`: that band is noise on this harness, not a result.`,
  `- Outside the band the faster arm \`leads\`. At ${STRUCTURAL_FACTOR}x or more it \`leads clearly\` - a gap that large cannot be explained by machine mood or driver state, so it is attributable to how the two libraries are built.`,
  '- Rows are archetypes. Category headings are headings, never rows: an average over a category hides its worst cell, so nothing here aggregates across archetypes.',
  '- Every row names the mechanism its difference comes from, drawn from the structural counters the harness collects. A row whose mechanism could not be evidenced is not published - it is listed under the omissions instead, with the reason.',
  '- One count for the whole table, chosen from the archetype ladders before any timing was read. It is never picked per row.',
  '- Every published time is the median of the per-run medians of several separate harness runs, and the bracket after it is the range those runs observed. A wide bracket is the measurement moving, not the library.',
  '- A cell whose runs did not all reach the same verdict prints `unstable across runs` followed by what each run said, and no verdict. It stays in the table: that the cell cannot be measured to that resolution on this machine is itself the finding.',
  '- Cells where ExoJS loses are published exactly like the cells where it wins. A table in which one library wins everywhere is not credible and will not survive being re-run by anyone else.',
  '',
];

/** Provenance block for the rendering domain - what a reader needs in order to reject the numbers. */
const renderingProvenance = (input: RenderingInput): string[] => {
  const lines = ['## Provenance', '', `Pooled from **${String(input.runs.length)} separate rendering runs**.`, ''];

  for (const [index, run] of input.runs.entries()) {
    lines.push(`Run ${String(index + 1)}:`, '');

    for (const entry of run) {
      lines.push(
        `- **${entry.backend}**: adapter \`${entry.adapter}\`, software rasterizer \`${String(entry.software)}\`, headless \`${String(entry.headless)}\`, flags \`${entry.flags.join(' ')}\`, engine \`${entry.engineVersion}\`${typeof entry.slotTier === 'number' ? `, sprite-batch slot tier \`${String(entry.slotTier)}\`` : ''}, measured \`${entry.timestamp}\``,
      );
    }

    lines.push('');
  }

  lines.push('');
  lines.push('Library arms:');
  lines.push('');

  for (const library of input.libraries) {
    lines.push(`- \`${library.name}\` @ \`${library.version}\``);
  }

  if (input.runs.flat().some(entry => entry.software)) {
    lines.push('');
    lines.push('> **These timings ran on a software rasterizer and are not reportable.** Every number below describes the host CPU, not a GPU.');
  }

  lines.push('');

  return lines;
};

/** Render the rendering half of the comparison document. */
const renderRenderingBlocks = (input: RenderingInput): string[] => {
  const lines: string[] = [];

  for (const backend of input.backends) {
    lines.push(`## Rendering - ${backend.backend}`, '');

    if (backend.headlineCount === null) {
      lines.push(
        'No single node count qualified on this backend: some arm failed to produce a valid cell at every candidate count. Nothing is published here rather than a table assembled from mismatched counts.',
        '',
      );

      continue;
    }

    lines.push(
      `All rows measured at **${backend.headlineCount} nodes**, the largest count present in every comparable archetype's ladder at which every arm produced a valid cell.`,
      '',
    );

    const columns = ['archetype', 'exojs (median CPU)', ...backend.competitors.map(competitor => `${competitor} (median CPU)`), 'mechanism'];

    for (const section of backend.sections) {
      lines.push(`### ${section.title}`, '');
      lines.push(...tableHead(columns));

      for (const row of section.rows) {
        lines.push(renderRow(row, backend.competitors));
      }

      lines.push('');
    }

    if (backend.webgl1.length > 0) {
      lines.push('### WebGL1 arms - CPU time only', '');
      lines.push(
        'Phaser 4 renders a WebGL1 context (verified against the installed dist). A gap against it can be caused by the backend generation as much as by the engine, and the WebGL2 structural probe cannot attach to say which - so these rows carry NO mechanism and are observations, not findings. They never share a table with the WebGL2/WebGPU arms.',
        '',
      );

      const webgl1Columns = [
        'archetype',
        'exojs (median CPU)',
        ...[...new Set(backend.webgl1.flatMap(row => row.cells.map(cell => cell.competitor)))].map(name => `${name} (median CPU)`),
        'mechanism',
      ];
      const webgl1Competitors = [...new Set(backend.webgl1.flatMap(row => row.cells.map(cell => cell.competitor)))];

      lines.push(...tableHead(webgl1Columns));

      for (const row of backend.webgl1) {
        lines.push(renderRow(row, webgl1Competitors));
      }

      lines.push('');
    }

    if (backend.excluded.length > 0) {
      lines.push('### Omissions', '');
      lines.push(
        'Every archetype measured but not published above, with the reason. The list is part of the report: a comparison that silently drops rows is not auditable.',
        '',
      );
      lines.push(...tableHead(['archetype', 'why it is not in the table']));

      for (const omission of backend.excluded) {
        lines.push(tableRow([`\`${omission.archetype}\``, omission.reason]));
      }

      lines.push('');
    }
  }

  return lines;
};

/** Render the physics half of the comparison document. */
const renderPhysicsBlock = (input: PhysicsInput): string[] => {
  const lines = ['## Physics', ''];
  const competitors = [...new Set(input.section.rows.flatMap(row => row.cells.map(cell => cell.competitor)))];

  const host = input.runs[0]!;

  lines.push(
    `Pooled from **${String(input.runs.length)} separate physics runs** in \`${host.browser} ${host.browserVersion}\` on host \`${host.host.cpu}\` (${String(host.host.cpuCount)} logical), OS \`${host.host.os}\`, fixed step \`${host.fixedDelta.toFixed(6)} s\`, measured \`${input.runs.map(run => run.timestamp).join('`, `')}\`.`,
    '',
  );

  for (const library of input.libraries) {
    lines.push(`- \`${library.name}\` @ \`${library.version}\``);
  }

  lines.push('');

  if (input.section.rows.length === 0) {
    lines.push('No physics row qualified: no single body count produced a valid cell on every arm.', '');

    return lines;
  }

  lines.push(`All rows measured at **${String(input.section.rows[0]!.count)} bodies**.`, '');
  lines.push(...tableHead(['archetype', 'exojs-physics (median step)', ...competitors.map(competitor => `${competitor} (median step)`), 'mechanism']));

  for (const row of input.section.rows) {
    lines.push(renderRow(row, competitors));
  }

  lines.push('');
  lines.push(
    'The arms run at their own engine defaults for solver iterations, contact model and sleeping; those differences are the measured quantity, and the run caveats state them per arm.',
    '',
  );

  return lines;
};

/**
 * Render the full comparison document. Either half may be absent - rendering
 * and physics are measured by separate invocations of the harness, and a
 * document generated from one of them must not imply it covers the other.
 */
export const renderComparison = (input: { rendering?: RenderingInput; physics?: PhysicsInput }): string => {
  const lines = ['# ExoJS cross-library comparison', ''];

  lines.push(
    'A workload profile, not a scoreboard. The question it answers is "does my workload fit this library", including the cases where the answer is "use something else for that".',
    '',
  );

  lines.push(...readingRules());

  if (input.rendering !== undefined) {
    lines.push(...renderingProvenance(input.rendering));
    lines.push(...renderRenderingBlocks(input.rendering));
  }

  if (input.physics !== undefined) {
    lines.push(...renderPhysicsBlock(input.physics));
  }

  if (input.rendering === undefined && input.physics === undefined) {
    lines.push('No results were supplied.', '');
  }

  return `${lines.join('\n')}\n`;
};
