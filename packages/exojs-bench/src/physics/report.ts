import type { LibraryProvenance } from '../shared/provenance';
import { csvField, formatCount as count, formatMs as ms, mergeCellResults, mergeLibraries, readExistingReport, writeReportArtifacts } from '../shared/report';
import type { PhysicsProvenance } from './driver';
import type { PhysicsCellResult } from './PhysicsAdapter';

/**
 * The observed clock step, or a word saying it was never observed.
 *
 * Not `0.0 us`: a clock whose step no probe could read is the absence of the
 * reading, and printing a zero there reads as the finest clock on record.
 */
const formatClockResolution = (resolutionMs: number | null): string => (resolutionMs === null ? 'not observed' : `${(resolutionMs * 1000).toFixed(1)} us`);

/** Everything one physics run produces: the provenance stamp, arm versions, and per-cell results. */
export interface PhysicsReportData {
  /** The run's provenance stamp (browser, host, engine version, timestep, caveats). */
  readonly provenance: PhysicsProvenance;
  /** Version + resolution provenance for each physics engine arm. */
  readonly libraries: readonly LibraryProvenance[];
  /** One result per matrix cell. */
  readonly results: readonly PhysicsCellResult[];
}

/** Ordered columns shared by the CSV and the Markdown table. */
const COLUMNS = [
  'engine',
  'config',
  'archetype',
  'bodyCount',
  'warmupSteps',
  'timedSteps',
  'stepsPerSample',
  'stepMsMedian',
  'stepMsP95',
  'bodies',
  'contacts',
  'joints',
  'rayHits',
  'status',
  'note',
] as const;

const toRow = (result: PhysicsCellResult): string[] => {
  const { spec, structural } = result;

  return [
    spec.engine,
    spec.config,
    spec.archetype,
    String(spec.bodyCount),
    String(spec.warmupSteps),
    String(spec.timedSteps),
    String(result.stepsPerSample),
    ms(result.stepMsMedian),
    ms(result.stepMsP95),
    count(structural.bodyCount),
    count(structural.contactCount),
    count(structural.jointCount),
    count(structural.rayHits),
    result.status,
    result.note ?? '',
  ];
};

const toCsv = (data: PhysicsReportData): string => [COLUMNS.join(','), ...data.results.map(result => toRow(result).map(csvField).join(','))].join('\n');

/**
 * Human-readable Markdown: the arm versions and the browser/host provenance
 * block first (a step-time number is only comparable if the browser, the CPU and
 * the exojs-physics version that produced it are on the record), the disclosed
 * caveats, then one table with the structural counters (bodies, contacts, joints, ray hits)
 * sitting BESIDE the timings - a fast step that came from fewer contacts, or a
 * query row whose rays all missed, must be visible in the same row.
 */
const toMarkdown = (data: PhysicsReportData): string => {
  const { provenance } = data;
  const lines: string[] = [];

  lines.push('# Physics Benchmark Results', '');

  lines.push('## Arms', '');

  if (data.libraries.length === 0) {
    lines.push('- (none)', '');
  } else {
    for (const library of data.libraries) {
      const resolved = library.resolvedFrom.length > 0 ? library.resolvedFrom : 'not resolved';

      lines.push(`- \`${library.name}\` @ **${library.version}** (resolved from: ${resolved})`);
    }

    lines.push('');
  }

  lines.push('## Provenance', '');
  lines.push(`- Engine version (exojs-physics): ${provenance.engineVersion}`);
  lines.push(`- Browser: ${provenance.browser} ${provenance.browserVersion}`);
  lines.push(`- CPU: ${provenance.host.cpu} (${String(provenance.host.cpuCount)} logical)`);
  lines.push(`- OS: ${provenance.host.os} (${provenance.host.arch})`);
  lines.push(`- Fixed timestep: ${String(provenance.fixedDelta)} s`);
  lines.push(
    `- Clock resolution: ${formatClockResolution(provenance.clock.resolutionMs)} (cross-origin isolated: ${String(provenance.clock.crossOriginIsolated)})`,
  );
  lines.push(`- Timestamp: ${provenance.timestamp}`);
  lines.push('');

  lines.push('## Caveats', '');

  for (const caveat of provenance.caveats) {
    lines.push(`- ${caveat}`);
  }

  lines.push('');

  lines.push('## Results', '');
  lines.push(`| ${COLUMNS.join(' | ')} |`);
  lines.push(`| ${COLUMNS.map(() => '---').join(' | ')} |`);

  for (const result of data.results) {
    lines.push(
      `| ${toRow(result)
        .map(field => field.replaceAll('|', '\\|'))
        .join(' | ')} |`,
    );
  }

  lines.push('');

  return lines.join('\n');
};

/**
 * Merges a run into the report `outDir` already holds. Cells follow
 * {@link mergeCellResults} and library versions {@link mergeLibraries}. The
 * single provenance stamp is the run's: a physics report carries one stamp for
 * the whole matrix, and the latest run is the one whose browser and clock
 * produced the newest cells.
 */
export const mergePhysicsReportData = (existing: PhysicsReportData | undefined, incoming: PhysicsReportData): PhysicsReportData =>
  existing === undefined
    ? incoming
    : {
        provenance: incoming.provenance,
        libraries: mergeLibraries(existing.libraries, incoming.libraries),
        results: mergeCellResults(existing.results, incoming.results),
      };

/**
 * Writes the three physics report artifacts into `outDir`:
 * - `results.json` - full fidelity (provenance + every result field).
 * - `results.csv` - one row per cell, machine-parseable.
 * - `results.md` - provenance/caveats block plus a human-readable table.
 *
 * An existing `results.json` in `outDir` is merged into rather than replaced
 * (see {@link mergePhysicsReportData}); the CSV and Markdown are rendered from
 * the merged data, so all three artifacts describe the same cell set.
 */
export const writePhysicsReport = (run: PhysicsReportData, outDir: string): void => {
  const data = mergePhysicsReportData(readExistingReport<PhysicsReportData>(outDir), run);

  writeReportArtifacts(outDir, {
    json: `${JSON.stringify(data, null, 2)}\n`,
    csv: `${toCsv(data)}\n`,
    md: toMarkdown(data),
  });
};
