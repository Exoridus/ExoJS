import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, ReflectionKind } from 'typedoc';

import { apiSymbolSchema } from '../src/lib/api-schema';
import type { ApiCounts, ApiMember, ApiSection, ApiSymbolData } from '../src/lib/api-schema';

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

/** Section id / anchor slug, e.g. "Constructors" -> "constructors". */
const toAnchor = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

/** Collapse a raw JSDoc summary to a single line (multi-line comments -> one). */
const toSingleLine = (value: string): string => value.replaceAll(/\s+/g, ' ').trim();

/** Split a raw JSDoc summary into paragraphs on blank lines, each collapsed. */
const toParagraphs = (value: string): string[] =>
    value
        .split(/\n\s*\n/)
        .map(part => toSingleLine(part))
        .filter(part => part.length > 0);

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

interface ExtractedParam {
    name: string;
    type: string;
    optional: boolean;
}

const extractParams = (signature: any): ExtractedParam[] =>
    (signature.parameters ?? []).map((parameter: any) => ({
        name: parameter.name,
        type: renderType(parameter.type),
        optional: Boolean(parameter.flags?.isOptional),
    }));

const renderSignature = (name: string, signature: any): string => {
    const params = extractParams(signature)
        .map(parameter => `${parameter.name}${parameter.optional ? '?' : ''}: ${parameter.type}`)
        .join(', ');
    return `${name}(${params}): ${renderType(signature.type)}`;
};

const resolvePropertyType = (member: any): any =>
    member.type ?? member.getSignature?.type;

const resolvePropertyComment = (member: any): any =>
    member.comment ?? member.getSignature?.comment;

/**
 * A member's JSDoc summary as a single-line description for the row cell.
 * Collapses multi-line comments to one line and strips inline-code backticks
 * (they would render as literal text inside the description cell). No MDX
 * escaping is needed — the value is stored in JSON and rendered as text.
 */
const toMemberDescription = (comment: any): string => {
    const raw = renderComment(comment);
    if (!raw) return '';
    return toSingleLine(raw).replaceAll('`', '');
};

/** A constructor/method member: structured params + a concrete return type. */
const buildCallableMember = (name: string, signature: any, fallbackComment: any): ApiMember => ({
    name,
    signature: renderSignature(name, signature),
    params: extractParams(signature),
    returnType: renderType(signature.type),
    description: toMemberDescription(signature.comment ?? fallbackComment),
});

/** A property/event member: no params, no return type. */
const buildValueMember = (name: string, type: string, comment: any): ApiMember => ({
    name,
    signature: `${name}: ${type}`,
    params: [],
    returnType: null,
    description: toMemberDescription(comment),
});

/** Wrap ordered members into a section with a slug id derived from the title. */
const toMemberSection = (title: string, members: ApiMember[]): ApiSection => ({
    id: toAnchor(title),
    title,
    members,
    paragraphs: [],
    importLine: null,
    sourceLink: null,
});

interface ReflectionBody {
    sections: ApiSection[];
    counts: ApiCounts;
    memberCount: number;
}

const renderClassMembers = (reflection: any): ReflectionBody => {
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

    const constructorMembers = constructors.flatMap((ctor: any) =>
        (ctor.signatures ?? []).map((signature: any) => buildCallableMember('new', signature, ctor.comment))
    );
    const methodMembers = methods.flatMap((method: any) =>
        (method.signatures ?? []).map((signature: any) => buildCallableMember(method.name, signature, method.comment))
    );
    const propertyMembers = plainProperties.map((property: any) =>
        buildValueMember(property.name, renderType(resolvePropertyType(property)), resolvePropertyComment(property))
    );
    const eventMembers = events.map((event: any) =>
        buildValueMember(event.name, renderType(resolvePropertyType(event)), resolvePropertyComment(event))
    );

    const sections: ApiSection[] = [];
    if (constructorMembers.length > 0) sections.push(toMemberSection('Constructors', constructorMembers));
    if (methodMembers.length > 0) sections.push(toMemberSection('Methods', methodMembers));
    if (propertyMembers.length > 0) sections.push(toMemberSection('Properties', propertyMembers));
    if (eventMembers.length > 0) sections.push(toMemberSection('Events', eventMembers));

    const counts: ApiCounts = {
        constructors: constructorMembers.length,
        methods: methodMembers.length,
        properties: propertyMembers.length,
        events: eventMembers.length,
    };

    return {
        sections,
        counts,
        memberCount: counts.constructors + counts.methods + counts.properties + counts.events,
    };
};

const EMPTY_COUNTS: ApiCounts = { constructors: 0, methods: 0, properties: 0, events: 0 };

const renderReflectionBody = (reflection: any): ReflectionBody => {
    if (isEnum(reflection.kind)) {
        // Enum members render as a bare name with no description, matching the
        // prior output — the signature is the member name itself.
        const members = (reflection.children ?? []).map((member: any): ApiMember => ({
            name: member.name,
            signature: member.name,
            params: [],
            returnType: null,
            description: '',
        }));
        return {
            sections: members.length > 0 ? [toMemberSection('Members', members)] : [],
            counts: EMPTY_COUNTS,
            memberCount: members.length,
        };
    }

    if (isClass(reflection.kind)) {
        return renderClassMembers(reflection);
    }

    return { sections: [], counts: EMPTY_COUNTS, memberCount: 0 };
};

const entryPointTitle = (reflection: any): string => {
    const sourcePath = normalizePath(reflection.sources?.[0]?.fileName ?? '');
    const subsystem = guessSubsystem(sourcePath);
    return subsystem === 'debug' ? '@codexo/exojs/debug' : '@codexo/exojs';
};

const ensureCleanOutput = (): void => {
    // maxRetries covers the transient Windows EPERM/EBUSY that hits recursive
    // rmSync when a file indexer or a parallel build step (examples:sync) has
    // the output directory momentarily open. Node retries these error codes.
    fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    const { sections: memberSections, counts, memberCount } = renderReflectionBody(reflection);
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
    // No `#L<line>` anchor: a line number shifts whenever unrelated code is
    // inserted above the symbol, which flips `docs:api:check` on a pure line
    // shift with zero content change. Link to the file itself instead.
    const sourceUrl = sourceRelative ? `https://github.com/Exoridus/ExoJS/blob/main/${sourceRelative}` : undefined;

    // The Import section carries the import statement plus the class-level
    // description (rendered as paragraphs); member sections follow; the Source
    // section, when present, carries the repo link. This mirrors exactly what
    // the API page rendered from the old MDX body, now as typed data.
    const sections: ApiSection[] = [
        {
            id: 'import',
            title: 'Import',
            members: [],
            paragraphs: description ? toParagraphs(description) : [],
            importLine: `import { ${reflection.name} } from '${importPath}'`,
            sourceLink: null,
        },
        ...memberSections,
    ];
    if (sourceUrl && sourceRelative) {
        sections.push({
            id: 'source',
            title: 'Source',
            members: [],
            paragraphs: [],
            importLine: null,
            sourceLink: { label: sourceRelative, href: sourceUrl },
        });
    }

    const data: ApiSymbolData = {
        title: reflection.name,
        description: toSingleLine(description),
        symbol: reflection.name,
        kind,
        subsystem,
        importPath,
        tier,
        memberCount,
        counts,
        sections,
        ...(sourceRelative ? { sourcePath: sourceRelative } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
    };

    // Validate against the shared schema so the generator can never emit data
    // the collection would reject at build time (fail fast, here, with context).
    const result = apiSymbolSchema.safeParse(data);
    if (!result.success) {
        throw new Error(`Generated API data for "${reflection.name}" is invalid:\n${result.error.toString()}`);
    }

    fs.writeFileSync(path.resolve(outputDir, `${slug}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
