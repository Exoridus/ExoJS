import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, ReflectionKind } from 'typedoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(siteRoot, '..');
const outputDir = path.resolve(siteRoot, 'src', 'content', 'api');
const toPosix = (value: string): string => value.replaceAll('\\', '/');

type Subsystem =
    | 'animation'
    | 'aseprite'
    | 'audio'
    | 'core'
    | 'debug'
    | 'input'
    | 'ldtk'
    | 'math'
    | 'particles'
    | 'physics'
    | 'rendering'
    | 'resources'
    | 'tiled'
    | 'tilemap';
type ApiKind = 'class' | 'enum';
type ApiTier = 'stable' | 'advanced';

const SUBSYSTEMS: ReadonlyArray<Subsystem> = [
    'animation',
    'aseprite',
    'audio',
    'core',
    'debug',
    'input',
    'ldtk',
    'math',
    'particles',
    'physics',
    'rendering',
    'resources',
    'tiled',
    'tilemap',
];

/**
 * Official extension packages documented as their own API surfaces, alongside
 * the core. Each is converted with its own tsconfig (which maps `@codexo/exojs`
 * to the core source) and only the package's OWN symbols are emitted — core
 * types the package re-exports are skipped so they are not duplicated.
 */
interface ExtensionPackage {
    importPath: string;
    subsystem: Subsystem;
    entryPoint: string;
    tsconfig: string;
    /** Substring every emitted symbol's source path must contain. */
    sourceMarker: string;
}

const EXTENSION_PACKAGES: ReadonlyArray<ExtensionPackage> = [
    {
        importPath: '@codexo/exojs-particles',
        subsystem: 'particles',
        entryPoint: 'packages/exojs-particles/src/index.ts',
        tsconfig: 'packages/exojs-particles/tsconfig.json',
        sourceMarker: 'packages/exojs-particles/src/',
    },
    {
        importPath: '@codexo/exojs-audio-fx',
        subsystem: 'audio',
        entryPoint: 'packages/exojs-audio-fx/src/index.ts',
        tsconfig: 'packages/exojs-audio-fx/tsconfig.json',
        sourceMarker: 'packages/exojs-audio-fx/src/',
    },
    {
        importPath: '@codexo/exojs-tilemap',
        subsystem: 'tilemap',
        entryPoint: 'packages/exojs-tilemap/src/index.ts',
        tsconfig: 'packages/exojs-tilemap/tsconfig.json',
        sourceMarker: 'packages/exojs-tilemap/src/',
    },
    {
        importPath: '@codexo/exojs-tiled',
        subsystem: 'tiled',
        entryPoint: 'packages/exojs-tiled/src/index.ts',
        tsconfig: 'packages/exojs-tiled/tsconfig.json',
        sourceMarker: 'packages/exojs-tiled/src/',
    },
    {
        importPath: '@codexo/exojs-physics',
        subsystem: 'physics',
        entryPoint: 'packages/exojs-physics/src/index.ts',
        tsconfig: 'packages/exojs-physics/tsconfig.json',
        sourceMarker: 'packages/exojs-physics/src/',
    },
    {
        importPath: '@codexo/exojs-aseprite',
        subsystem: 'aseprite',
        entryPoint: 'packages/exojs-aseprite/src/index.ts',
        tsconfig: 'packages/exojs-aseprite/tsconfig.json',
        sourceMarker: 'packages/exojs-aseprite/src/',
    },
    {
        importPath: '@codexo/exojs-ldtk',
        subsystem: 'ldtk',
        entryPoint: 'packages/exojs-ldtk/src/index.ts',
        tsconfig: 'packages/exojs-ldtk/tsconfig.json',
        sourceMarker: 'packages/exojs-ldtk/src/',
    },
];

const isClass = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Class) > 0;
const isEnum = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Enum) > 0;
const isDocumentableKind = (kind: ReflectionKind): boolean => isClass(kind) || isEnum(kind);
const toApiKind = (kind: ReflectionKind): ApiKind => (isClass(kind) ? 'class' : 'enum');

const slugify = (input: string): string =>
    input
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

const normalizePath = (value: string): string => value.replaceAll('\\', '/');

const guessSubsystem = (sourcePath: string): Subsystem => {
    const normalized = normalizePath(sourcePath);
    if (normalized.includes('/src/debug/') || normalized.includes('src/debug/')) return 'debug';

    for (const subsystem of SUBSYSTEMS) {
        if (subsystem === 'debug' || subsystem === 'core') continue;
        if (normalized.includes(`/src/${subsystem}/`) || normalized.includes(`src/${subsystem}/`)) return subsystem;
    }

    return 'core';
};

const renderComment = (comment: any): string => {
    const summary = (comment?.summary ?? [])
        .map((part: any) => part?.text ?? '')
        .join('')
        .trim();
    return summary;
};

const toFrontmatterString = (value: string): string => `"${value.replaceAll(/\s+/g, ' ').trim().replaceAll('"', '\\"')}"`;
const toFrontmatterArray = (values: ReadonlyArray<string>): string =>
    `[${values.map(value => `"${value.replaceAll('"', '\\"')}"`).join(', ')}]`;
const escapeMdxText = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('<', '\\<');

const renderType = (type: any): string => {
    if (!type) return 'unknown';
    switch (type.type) {
        case 'intrinsic':
            return type.name;
        case 'reference':
            return `${type.name}${type.typeArguments?.length ? `<${type.typeArguments.map(renderType).join(', ')}>` : ''}`;
        case 'union':
            return type.types?.map(renderType).join(' | ') ?? 'unknown';
        case 'intersection':
            return type.types?.map(renderType).join(' & ') ?? 'unknown';
        case 'array':
            return `${renderType(type.elementType)}[]`;
        case 'tuple':
            return `[${(type.elements ?? []).map(renderType).join(', ')}]`;
        case 'literal':
            return JSON.stringify(type.value);
        case 'reflection':
            return 'object';
        case 'query':
            return `typeof ${type.queryType?.name ?? 'unknown'}`;
        case 'typeOperator':
            return `${type.operator} ${renderType(type.target)}`;
        case 'conditional':
            return `${renderType(type.checkType)} extends ${renderType(type.extendsType)} ? ${renderType(type.trueType)} : ${renderType(type.falseType)}`;
        case 'indexedAccess':
            return `${renderType(type.objectType)}[${renderType(type.indexType)}]`;
        default:
            return type.name ?? type.type ?? 'unknown';
    }
};

const renderSignature = (name: string, signature: any): string => {
    const params = (signature.parameters ?? [])
        .map((parameter: any) => `${parameter.name}${parameter.flags?.isOptional ? '?' : ''}: ${renderType(parameter.type)}`)
        .join(', ');
    const returns = renderType(signature.type);
    return `${name}(${params}): ${returns}`;
};

const resolvePropertyType = (member: any): any =>
    member.type ?? member.getSignature?.type;

const renderClassMembers = (reflection: any): { body: string; sections: string[]; memberCount: number } => {
    const children = reflection.children ?? [];
    const constructors = children.filter((child: any) => (child.kind & ReflectionKind.Constructor) > 0);
    const methods = children.filter((child: any) => (child.kind & ReflectionKind.Method) > 0);
    // Include both Property (1024) and Accessor (262144 — getter/setter) kinds so
    // TypeScript getters like currentScene, scenes, angle, length appear in docs.
    const properties = children.filter((child: any) =>
        !child.name.startsWith('_') &&
        ((child.kind & ReflectionKind.Property) > 0 || (child.kind & 262144) > 0)
    );
    const events = properties.filter((property: any) =>
        property.name.startsWith('on') && renderType(resolvePropertyType(property)).startsWith('Signal<')
    );
    const plainProperties = properties.filter((property: any) => !events.includes(property));

    const blocks: Array<string> = [];
    const sections: Array<string> = [];

    if (constructors.length > 0) {
        const lines = constructors.flatMap((ctor: any) => (ctor.signatures ?? []).map((signature: any) => `- \`${renderSignature('new', signature)}\``));
        blocks.push(`## Constructors\n\n${lines.join('\n')}`);
        sections.push('Constructors');
    }

    if (methods.length > 0) {
        const lines = methods.flatMap((method: any) =>
            (method.signatures ?? []).map((signature: any) => `- \`${renderSignature(method.name, signature)}\``)
        );
        blocks.push(`## Methods\n\n${lines.join('\n')}`);
        sections.push('Methods');
    }

    if (plainProperties.length > 0) {
        const lines = plainProperties.map((property: any) => `- \`${property.name}: ${renderType(resolvePropertyType(property))}\``);
        blocks.push(`## Properties\n\n${lines.join('\n')}`);
        sections.push('Properties');
    }

    if (events.length > 0) {
        const lines = events.map((event: any) => `- \`${event.name}: ${renderType(resolvePropertyType(event))}\``);
        blocks.push(`## Events\n\n${lines.join('\n')}`);
        sections.push('Events');
    }

    return {
        body: blocks.join('\n\n'),
        sections,
        memberCount: constructors.length + methods.length + plainProperties.length + events.length,
    };
};

const renderReflectionBody = (reflection: any): { body: string; sections: string[]; memberCount: number } => {
    if (isEnum(reflection.kind)) {
        const members = (reflection.children ?? []).map((member: any) => `- \`${member.name}\``);
        return {
            body: members.length > 0 ? `## Members\n\n${members.join('\n')}` : '',
            sections: members.length > 0 ? ['Members'] : [],
            memberCount: members.length,
        };
    }

    if (isClass(reflection.kind)) {
        return renderClassMembers(reflection);
    }

    return { body: '', sections: [], memberCount: 0 };
};

const entryPointTitle = (reflection: any): string => {
    const sourcePath = normalizePath(reflection.sources?.[0]?.fileName ?? '');
    const subsystem = guessSubsystem(sourcePath);
    return subsystem === 'debug' ? '@codexo/exojs/debug' : '@codexo/exojs';
};

const ensureCleanOutput = (): void => {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
};

const MODIFIER_TAGS = ['@stable', '@advanced', '@override', '@internal', '@alpha', '@beta', '@experimental', '@virtual', '@readonly', '@sealed', '@abstract', '@public', '@protected', '@private'];

interface EmitOptions {
    /** Force a fixed import path (extension packages). When unset, derive from source. */
    importPathOverride?: string;
    /** Force a fixed subsystem (extension packages). When unset, guess from source. */
    subsystemOverride?: Subsystem;
    /** When set, only emit symbols whose source path contains this marker. */
    sourceMarker?: string;
}

const emitReflection = (reflection: any, usedSlugs: Set<string>, options: EmitOptions): boolean => {
    if (!isDocumentableKind(reflection.kind)) return false;

    const source = reflection.sources?.[0];
    const sourcePath = source?.fileName ? normalizePath(source.fileName) : undefined;

    // Extension packages re-export core types; only document the package's own
    // symbols so core pages are never duplicated under a package surface.
    if (options.sourceMarker && !(sourcePath ?? '').includes(options.sourceMarker)) return false;

    const subsystem = options.subsystemOverride ?? guessSubsystem(sourcePath ?? '');
    const importPath = options.importPathOverride ?? entryPointTitle(reflection);
    const description = renderComment(reflection.comment);
    const tier: ApiTier = reflection.comment?.modifierTags?.has('@advanced') ? 'advanced' : 'stable';
    const { body, sections, memberCount } = renderReflectionBody(reflection);
    const kind = toApiKind(reflection.kind);

    const baseSlug = slugify(reflection.name);
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
    }
    usedSlugs.add(slug);

    // Core sources live under <repo>/src; package sources under <repo>/packages/<pkg>/src.
    // Prefer the package-relative form so extension source links resolve correctly.
    const sourceRelative = sourcePath
        ? (sourcePath.match(/(?:^|\/)(packages\/[^/]+\/src\/.*)$/)?.[1] ?? sourcePath.match(/(?:^|\/)(src\/.*)$/)?.[1])
        : undefined;
    const sourceUrl = sourceRelative && source?.line ? `https://github.com/Exoridus/ExoJS/blob/main/${sourceRelative}#L${source.line}` : undefined;
    const safeDescriptionBody = description ? escapeMdxText(description) : '';
    const allSections = ['Import', ...sections, ...(sourceUrl ? ['Source'] : [])];
    const bodyBlocks: Array<string> = [`## Import\n\n\`import { ${reflection.name} } from '${importPath}'\``];
    if (safeDescriptionBody.length > 0) {
        bodyBlocks.push(safeDescriptionBody);
    }
    if (body.length > 0) {
        bodyBlocks.push(body);
    }
    if (sourceUrl && sourceRelative) {
        bodyBlocks.push(`## Source\n\n[${sourceRelative}](${sourceUrl})`);
    }
    const composedBody = bodyBlocks.join('\n\n');

    const mdx = [
        '---',
        `title: ${toFrontmatterString(reflection.name)}`,
        `description: ${toFrontmatterString(description)}`,
        `symbol: ${toFrontmatterString(reflection.name)}`,
        `kind: ${toFrontmatterString(kind)}`,
        `subsystem: ${toFrontmatterString(subsystem)}`,
        `importPath: ${toFrontmatterString(importPath)}`,
        `memberCount: ${memberCount}`,
        `tier: ${toFrontmatterString(tier)}`,
        `sections: ${toFrontmatterArray(allSections)}`,
        sourceRelative ? `sourcePath: ${toFrontmatterString(sourceRelative)}` : '',
        sourceUrl ? `sourceUrl: ${toFrontmatterString(sourceUrl)}` : '',
        '---',
        '',
        composedBody,
    ]
        .filter(Boolean)
        .join('\n');

    fs.writeFileSync(path.resolve(outputDir, `${slug}.mdx`), `${mdx}\n`, 'utf8');
    return true;
};

/**
 * Collect documentable (class/enum) reflections from a converted project,
 * handling both shapes TypeDoc produces: multiple entry points nest symbols
 * under per-module children; a single entry point flattens them onto the
 * project root.
 */
const collectSymbols = (project: any): any[] => {
    const out: any[] = [];
    for (const child of project.children ?? []) {
        if (isDocumentableKind(child.kind)) {
            out.push(child);
        } else if (Array.isArray(child.children)) {
            for (const sub of child.children) {
                if (isDocumentableKind(sub.kind)) out.push(sub);
            }
        }
    }
    return out;
};

const convertEntryPoints = async (entryPoints: ReadonlyArray<string>, tsconfig: string): Promise<any> => {
    const app = await Application.bootstrapWithPlugins({
        entryPoints: entryPoints.map(entry => toPosix(path.resolve(repoRoot, entry))),
        tsconfig: toPosix(path.resolve(repoRoot, tsconfig)),
        // Pin the source-path base to the repo root so every package reports
        // repo-relative file names (packages/<pkg>/src/…). Without this TypeDoc
        // infers a per-package base for packages that pull in no core *source*
        // files (e.g. physics), yielding package-relative paths that miss the
        // sourceMarker filter and break source links.
        basePath: toPosix(repoRoot),
        excludeInternal: true,
        modifierTags: MODIFIER_TAGS,
    });

    const project = await app.convert();
    if (!project) {
        throw new Error(`TypeDoc conversion failed for ${entryPoints.join(', ')}.`);
    }
    return project;
};

const build = async (): Promise<void> => {
    ensureCleanOutput();
    const usedSlugs = new Set<string>();

    // 1. Core (+ debug subpath).
    const coreProject = await convertEntryPoints(['src/index.ts', 'src/debug/index.ts'], 'tsconfig.json');
    let coreCount = 0;
    for (const reflection of collectSymbols(coreProject)) {
        if (emitReflection(reflection, usedSlugs, {})) coreCount += 1;
    }

    if (coreCount === 0) {
        throw new Error('TypeDoc conversion produced no exportable core symbols.');
    }

    // 2. Official extension packages — each as its own discoverable surface.
    const packageCounts: Array<{ importPath: string; count: number }> = [];
    for (const pkg of EXTENSION_PACKAGES) {
        const project = await convertEntryPoints([pkg.entryPoint], pkg.tsconfig);
        let count = 0;
        for (const reflection of collectSymbols(project)) {
            if (
                emitReflection(reflection, usedSlugs, {
                    importPathOverride: pkg.importPath,
                    subsystemOverride: pkg.subsystem,
                    sourceMarker: pkg.sourceMarker,
                })
            ) {
                count += 1;
            }
        }
        if (count === 0) {
            throw new Error(`TypeDoc conversion produced no own symbols for ${pkg.importPath}.`);
        }
        packageCounts.push({ importPath: pkg.importPath, count });
    }

    const summary = [`${coreCount} core`, ...packageCounts.map(p => `${p.count} ${p.importPath}`)].join(', ');
    console.log(`[build:api] Generated ${usedSlugs.size} API page(s) (${summary}) in ${outputDir}`);
};

void build();
