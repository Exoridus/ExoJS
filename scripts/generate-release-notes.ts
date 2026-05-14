import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ChangelogEntry {
  sectionBody: string;
  releaseDate?: string;
  version: string;
}

interface ChangelogEntryWithBounds extends ChangelogEntry {
  bodyStart: number;
  headingStart: number;
}

interface GenerateReleaseNotesOptions {
  changelogPath?: string;
  cwd?: string;
  outputPath?: string;
  repo: string;
  tag: string;
  templatePath?: string;
}

interface GenerateReleaseNotesResult {
  changelogSection: string;
  currentTag: string;
  releaseDate: string;
  renderedNotes: string;
  repoUrl: string;
  version: string;
  writtenToPath?: string;
}

interface ParsedCliArgs {
  changelogPath: string;
  outputPath: string;
  repo: string;
  tag: string;
  templatePath: string;
}

interface ParsedTagVersion {
  major: number;
  minor: number;
  patch: number;
  tag: string;
  version: string;
}

const defaultChangelogPath = 'CHANGELOG.md';
const defaultTemplatePath = '.github/templates/release-notes.md';

const changelogHeadingPattern = /^##\s+\[(?<version>[^\]]+)](?:\s*-\s*(?<releaseDate>\d{4}-\d{2}-\d{2}))?\s*$/gm;
const placeholderPattern = /\$\{([A-Z_]+)}/g;

const semverTagPattern = /^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[-+].+)?$/;
const repoSlugPattern = /^(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)$/;

const fail = (message: string): never => {
  throw new Error(message);
};

const readTextFile = (path: string, description: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`Unable to read ${description} at "${path}": ${reason}`);
  }
};

const parseTag = (tag: string): ParsedTagVersion => {
  const match = semverTagPattern.exec(tag);
  if (!match || !match.groups) {
    fail(`Invalid --tag "${tag}". Expected a semver tag like "v0.8.4".`);
  }

  const major = Number(match.groups.major);
  const minor = Number(match.groups.minor);
  const patch = Number(match.groups.patch);

  return {
    major,
    minor,
    patch,
    tag,
    version: `${major}.${minor}.${patch}`,
  };
};

const compareVersions = (left: ParsedTagVersion, right: ParsedTagVersion): number => {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
};

const parseChangelogEntries = (changelog: string): ChangelogEntry[] => {
  changelogHeadingPattern.lastIndex = 0;
  const entriesWithBounds: ChangelogEntryWithBounds[] = [];
  let match = changelogHeadingPattern.exec(changelog);

  while (match) {
    const version = match.groups?.version;
    if (typeof version === 'string') {
      const headingStart = match.index;
      const headingEnd = changelog.indexOf('\n', headingStart);
      const bodyStart = headingEnd === -1 ? changelog.length : headingEnd + 1;
      const releaseDate = match.groups?.releaseDate;

      entriesWithBounds.push({
        bodyStart,
        headingStart,
        releaseDate,
        sectionBody: '',
        version,
      });
    }

    match = changelogHeadingPattern.exec(changelog);
  }

  return entriesWithBounds.map((entry, index) => {
    const bodyEnd = index < entriesWithBounds.length - 1 ? entriesWithBounds[index + 1].headingStart : changelog.length;
    const sectionBody = changelog.slice(entry.bodyStart, bodyEnd).trim();
    return {
      releaseDate: entry.releaseDate,
      sectionBody,
      version: entry.version,
    };
  });
};

const getMatchingChangelogEntry = (changelog: string, version: string): ChangelogEntry => {
  const entries = parseChangelogEntries(changelog);
  const matchingEntry = entries.find(entry => entry.version === version);
  if (!matchingEntry) {
    fail(`Missing changelog section for version ${version}. Expected heading: "## [${version}] - YYYY-MM-DD".`);
  }

  if (!matchingEntry.releaseDate) {
    fail(`Release date is missing for changelog section [${version}]. Expected heading: "## [${version}] - YYYY-MM-DD".`);
  }

  if (!matchingEntry.sectionBody) {
    fail(`Changelog section [${version}] is empty. Add release notes content under "## [${version}] - ${matchingEntry.releaseDate}".`);
  }

  return matchingEntry;
};

const resolveRepoUrl = (repo: string): string => {
  if (!repoSlugPattern.test(repo)) {
    fail(`Invalid --repo "${repo}". Expected "owner/repo", for example "Exoridus/ExoJS".`);
  }
  return `https://github.com/${repo}`;
};

const parseTagVersion = (tag: string): ParsedTagVersion | null => {
  const match = semverTagPattern.exec(tag);
  if (!match || !match.groups) {
    return null;
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    tag,
    version: `${match.groups.major}.${match.groups.minor}.${match.groups.patch}`,
  };
};

const getGitSemverTags = (cwd: string): string[] => {
  try {
    const raw = execSync('git tag --list "v*"', { cwd, encoding: 'utf8' });
    return raw
      .split('\n')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  } catch {
    return [];
  }
};

const resolvePreviousTagFromGit = (cwd: string, currentVersion: ParsedTagVersion): string | null => {
  const candidates = getGitSemverTags(cwd)
    .map(parseTagVersion)
    .filter((value): value is ParsedTagVersion => value !== null)
    .filter(candidate => compareVersions(candidate, currentVersion) < 0)
    .sort(compareVersions);

  const previous = candidates.at(-1);
  return previous ? previous.tag : null;
};

const resolvePreviousTagFromChangelog = (changelog: string, currentVersion: ParsedTagVersion): string | null => {
  const entries = parseChangelogEntries(changelog);
  const candidates = entries
    .map(entry => parseTagVersion(`v${entry.version}`))
    .filter((value): value is ParsedTagVersion => value !== null)
    .filter(candidate => compareVersions(candidate, currentVersion) < 0)
    .sort(compareVersions);

  const previous = candidates.at(-1);
  return previous ? previous.tag : null;
};

const resolvePreviousTag = (cwd: string, changelog: string, currentVersion: ParsedTagVersion): string => {
  const fromGit = resolvePreviousTagFromGit(cwd, currentVersion);
  if (fromGit) {
    return fromGit;
  }

  const fromChangelog = resolvePreviousTagFromChangelog(changelog, currentVersion);
  if (fromChangelog) {
    return fromChangelog;
  }

  fail(`Unable to determine PREVIOUS_TAG for ${currentVersion.tag}. No lower semver tag was found in git tags or CHANGELOG.md.`);
};

const applyTemplate = (template: string, replacements: Record<string, string>): string => {
  const unresolved = new Set<string>();
  const rendered = template.replaceAll(placeholderPattern, (_match, key: string) => {
    if (Object.hasOwn(replacements, key)) {
      return replacements[key];
    }
    unresolved.add(key);
    return `\${${key}}`;
  });

  if (unresolved.size > 0) {
    const names = Array.from(unresolved).sort().join(', ');
    fail(`Template contains unresolved placeholders: ${names}`);
  }

  return rendered;
};

export const generateReleaseNotes = (options: GenerateReleaseNotesOptions): GenerateReleaseNotesResult => {
  const cwd = options.cwd ?? process.cwd();
  const currentVersion = parseTag(options.tag);
  const repoUrl = resolveRepoUrl(options.repo);

  const changelogPath = resolve(cwd, options.changelogPath ?? defaultChangelogPath);
  const templatePath = resolve(cwd, options.templatePath ?? defaultTemplatePath);

  const changelog = readTextFile(changelogPath, 'changelog');
  const template = readTextFile(templatePath, 'release-notes template');

  const changelogEntry = getMatchingChangelogEntry(changelog, currentVersion.version);
  const previousTag = resolvePreviousTag(cwd, changelog, currentVersion);

  const renderedNotes = applyTemplate(template, {
    CHANGELOG_SECTION: changelogEntry.sectionBody,
    CURRENT_TAG: currentVersion.tag,
    PREVIOUS_TAG: previousTag,
    RELEASE_DATE: changelogEntry.releaseDate,
    REPO_URL: repoUrl,
    VERSION: currentVersion.version,
  });

  let writtenToPath: string | undefined;
  if (options.outputPath) {
    const outputPath = resolve(cwd, options.outputPath);
    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${renderedNotes}\n`);
      writtenToPath = outputPath;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(`Unable to write release notes output "${outputPath}": ${reason}`);
    }
  }

  return {
    changelogSection: changelogEntry.sectionBody,
    currentTag: currentVersion.tag,
    releaseDate: changelogEntry.releaseDate,
    renderedNotes,
    repoUrl,
    version: currentVersion.version,
    writtenToPath,
  };
};

const parseCliArgs = (argv: string[]): ParsedCliArgs => {
  const values = new Map<string, string>();
  const supported = new Set(['--tag', '--repo', '--out', '--changelog', '--template']);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!supported.has(arg)) {
      fail(`Unknown argument "${arg}". Supported arguments: --tag, --repo, --out, --changelog, --template`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      fail(`Missing value for argument "${arg}".`);
    }

    values.set(arg, value);
    index += 1;
  }

  const tag = values.get('--tag');
  if (!tag) {
    fail('Missing required argument --tag (example: --tag v0.8.4).');
  }

  const repo = values.get('--repo');
  if (!repo) {
    fail('Missing required argument --repo (example: --repo Exoridus/ExoJS).');
  }

  const outputPath = values.get('--out');
  if (!outputPath) {
    fail('Missing required argument --out (example: --out .release/release-notes.md).');
  }

  return {
    changelogPath: values.get('--changelog') ?? defaultChangelogPath,
    outputPath,
    repo,
    tag,
    templatePath: values.get('--template') ?? defaultTemplatePath,
  };
};

const runCli = (): void => {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const result = generateReleaseNotes({
      changelogPath: args.changelogPath,
      outputPath: args.outputPath,
      repo: args.repo,
      tag: args.tag,
      templatePath: args.templatePath,
    });

    const target = result.writtenToPath ?? resolve(process.cwd(), args.outputPath);
    process.stdout.write(`Generated release notes for ${result.currentTag} at ${target}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`release:notes failed: ${message}\n`);
    process.exit(1);
  }
};

const isMainModule = (() => {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return resolve(entrypoint) === fileURLToPath(import.meta.url);
})();

if (isMainModule) {
  runCli();
}
