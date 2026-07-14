import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, ReflectionKind } from 'typedoc';

import { apiSymbolSchema } from '../src/lib/api-schema';
import type { ApiCounts, ApiMember, ApiSection, ApiToken, ApiSymbolData } from '../src/lib/api-schema';

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
    | 'extensions'
    | 'input'
    | 'ldtk'
    | 'math'
    | 'particles'
    | 'physics'
    | 'rendering'
    | 'resources'
    | 'tiled'
    | 'tilemap'
    | 'ui';
type ApiKind = 'class' | 'enum' | 'interface' | 'type' | 'function' | 'namespace' | 'variable';
type ApiTier = 'stable' | 'advanced';

const SUBSYSTEMS: ReadonlyArray<Subsystem> = [
    'animation',
    'aseprite',
    'audio',
    'core',
    'debug',
    'extensions',
    'input',
    'ldtk',
    'math',
    'particles',
    'physics',
    'rendering',
    'resources',
    'tiled',
    'tilemap',
    'ui',
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
const isInterface = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Interface) > 0;
const isTypeAlias = (kind: ReflectionKind): boolean => (kind & ReflectionKind.TypeAlias) > 0;
const isDocumentableKind = (kind: ReflectionKind): boolean =>
    isClass(kind) || isEnum(kind) || isInterface(kind) || isTypeAlias(kind);
const isFunction = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Function) > 0;
const isVariable = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Variable) > 0;

const toApiKind = (kind: ReflectionKind): ApiKind => {
    if (isClass(kind)) return 'class';
    if (isInterface(kind)) return 'interface';
    if (isEnum(kind)) return 'enum';
    if (isFunction(kind)) return 'function';
    // An object-literal `const` (MathUtils, Collision, …) documents like a
    // namespace: a bag of function/value members.
    if (isVariable(kind)) return 'namespace';
    return 'type';
};

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

const punct = (text: string): ApiToken => ({ text, kind: 'punctuation' });
const keyword = (text: string): ApiToken => ({ text, kind: 'keyword' });
const typeToken = (text: string): ApiToken => ({ text, kind: 'type' });

/** Concatenate token groups, inserting a punctuation separator between them. */
const joinTokenGroups = (groups: ApiToken[][], separator: string): ApiToken[] => {
    const out: ApiToken[] = [];
    groups.forEach((group, index) => {
        if (index > 0) out.push(punct(separator));
        out.push(...group);
    });
    return out;
};

/**
 * Tokenize a TypeDoc type into colored/linkable pieces. Mirrors the old
 * renderType string output exactly (tokensToText below reproduces it byte for
 * byte), but every reference name is its own `type` token so the page can turn
 * documented ones into cross-links. Intrinsics/literals are keywords.
 */
const tokenizeType = (type: any): ApiToken[] => {
    if (!type) return [keyword('unknown')];
    switch (type.type) {
        case 'intrinsic':
            return [keyword(type.name)];
        case 'reference': {
            const tokens: ApiToken[] = [typeToken(type.name)];
            if (type.typeArguments?.length) {
                tokens.push(punct('<'), ...joinTokenGroups(type.typeArguments.map(tokenizeType), ', '), punct('>'));
            }
            return tokens;
        }
        case 'union':
            return type.types?.length ? joinTokenGroups(type.types.map(tokenizeType), ' | ') : [keyword('unknown')];
        case 'intersection':
            return type.types?.length ? joinTokenGroups(type.types.map(tokenizeType), ' & ') : [keyword('unknown')];
        case 'array':
            return [...tokenizeType(type.elementType), punct('[]')];
        case 'tuple':
            return [punct('['), ...joinTokenGroups((type.elements ?? []).map(tokenizeType), ', '), punct(']')];
        case 'literal':
            return [keyword(JSON.stringify(type.value))];
        case 'reflection': {
            // An inline function type — `(a: T) => R` — or object-literal type
            // — `{ a: T; b?: U }`. Without this both collapse to a useless
            // `object`, which matters most for function-typed aliases
            // (EasingFunction, callbacks) and object-shaped type aliases.
            const declaration = type.declaration;
            const signature = declaration?.signatures?.[0];
            if (signature) {
                const tokens: ApiToken[] = [punct('(')];
                (signature.parameters ?? []).forEach((parameter: any, index: number) => {
                    if (index > 0) tokens.push(punct(', '));
                    tokens.push({ text: parameter.name, kind: 'param' });
                    if (parameter.flags?.isOptional) tokens.push(punct('?'));
                    tokens.push(punct(': '), ...tokenizeType(parameter.type));
                });
                tokens.push(punct(') => '), ...tokenizeType(signature.type));
                return tokens;
            }
            if (declaration?.children?.length) {
                const tokens: ApiToken[] = [punct('{ ')];
                declaration.children.forEach((child: any, index: number) => {
                    if (index > 0) tokens.push(punct('; '));
                    tokens.push({ text: child.name, kind: 'name' });
                    if (child.flags?.isOptional) tokens.push(punct('?'));
                    tokens.push(punct(': '), ...tokenizeType(child.type ?? child.getSignature?.type));
                });
                tokens.push(punct(' }'));
                return tokens;
            }
            return [keyword('object')];
        }
        case 'query':
            return [keyword('typeof'), punct(' '), typeToken(type.queryType?.name ?? 'unknown')];
        case 'typeOperator':
            return [keyword(type.operator), punct(' '), ...tokenizeType(type.target)];
        case 'conditional':
            return [
                ...tokenizeType(type.checkType),
                punct(' '),
                keyword('extends'),
                punct(' '),
                ...tokenizeType(type.extendsType),
                punct(' ? '),
                ...tokenizeType(type.trueType),
                punct(' : '),
                ...tokenizeType(type.falseType),
            ];
        case 'indexedAccess':
            return [...tokenizeType(type.objectType), punct('['), ...tokenizeType(type.indexType), punct(']')];
        default:
            return [type.name ? typeToken(type.name) : keyword(type.type ?? 'unknown')];
    }
};

const tokensToText = (tokens: ApiToken[]): string => tokens.map(token => token.text).join('');

const renderType = (type: any): string => tokensToText(tokenizeType(type));

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

/** Tokenized `name(params): Return` for a constructor/method signature. */
const tokenizeSignature = (name: string, signature: any, optional = false): ApiToken[] => {
    const tokens: ApiToken[] = [name === 'new' ? keyword('new') : { text: name, kind: 'name' }];
    if (optional) tokens.push(punct('?'));
    tokens.push(punct('('));
    (signature.parameters ?? []).forEach((parameter: any, index: number) => {
        if (index > 0) tokens.push(punct(', '));
        tokens.push({ text: parameter.name, kind: 'param' });
        if (parameter.flags?.isOptional) tokens.push(punct('?'));
        tokens.push(punct(': '), ...tokenizeType(parameter.type));
    });
    tokens.push(punct(')'), punct(': '), ...tokenizeType(signature.type));
    return tokens;
};

/** Tokenized `name: Type` for a property/event member (optional adds `?`). */
const tokenizeValue = (name: string, type: any, optional = false): ApiToken[] => [
    { text: name, kind: 'name' },
    ...(optional ? [punct('?')] : []),
    punct(': '),
    ...tokenizeType(type),
];

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
const buildCallableMember = (name: string, signature: any, fallbackComment: any, optional = false): ApiMember => {
    const tokens = tokenizeSignature(name, signature, optional);
    return {
        name,
        signature: tokensToText(tokens),
        signatureTokens: tokens,
        params: extractParams(signature),
        returnType: renderType(signature.type),
        description: toMemberDescription(signature.comment ?? fallbackComment),
    };
};

/** A property/event member: no params, no return type. Takes the raw type node. */
const buildValueMember = (name: string, typeNode: any, comment: any, optional = false): ApiMember => {
    const tokens = tokenizeValue(name, typeNode, optional);
    return {
        name,
        signature: tokensToText(tokens),
        signatureTokens: tokens,
        params: [],
        returnType: null,
        description: toMemberDescription(comment),
    };
};

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
        (method.signatures ?? []).map((signature: any) =>
            buildCallableMember(method.name, signature, method.comment, Boolean(method.flags?.isOptional))
        )
    );
    const propertyMembers = plainProperties.map((property: any) =>
        buildValueMember(property.name, resolvePropertyType(property), resolvePropertyComment(property), Boolean(property.flags?.isOptional))
    );
    const eventMembers = events.map((event: any) =>
        buildValueMember(event.name, resolvePropertyType(event), resolvePropertyComment(event), Boolean(event.flags?.isOptional))
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

/**
 * Sections for an object-literal `const` (MathUtils, Collision, …): its
 * function members render as Methods, its value members as Properties.
 */
const buildObjectSections = (declaration: any): ReflectionBody => {
    const children = (declaration.children ?? []).filter((child: any) => !child.name.startsWith('_'));
    const methods = children.filter((child: any) => (child.signatures?.length ?? 0) > 0);
    const values = children.filter((child: any) => (child.signatures?.length ?? 0) === 0);
    const methodMembers = methods.flatMap((method: any) =>
        (method.signatures ?? []).map((signature: any) => buildCallableMember(method.name, signature, method.comment))
    );
    const valueMembers = values.map((value: any) =>
        buildValueMember(value.name, value.type ?? value.getSignature?.type, value.comment, Boolean(value.flags?.isOptional))
    );
    const sections: ApiSection[] = [];
    if (methodMembers.length > 0) sections.push(toMemberSection('Methods', methodMembers));
    if (valueMembers.length > 0) sections.push(toMemberSection('Properties', valueMembers));
    return {
        sections,
        counts: { constructors: 0, methods: methodMembers.length, properties: valueMembers.length, events: 0 },
        memberCount: methodMembers.length + valueMembers.length,
    };
};

const renderReflectionBody = (reflection: any): ReflectionBody => {
    if (isEnum(reflection.kind)) {
        // Enum members render as a bare name with no description, matching the
        // prior output — the signature is the member name itself.
        const members = (reflection.children ?? []).map((member: any): ApiMember => ({
            name: member.name,
            signature: member.name,
            signatureTokens: [{ text: member.name, kind: 'name' }],
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

    // Interfaces expose the same member shapes as classes (methods, properties,
    // optional members) — the class renderer handles them directly.
    if (isClass(reflection.kind) || isInterface(reflection.kind)) {
        return renderClassMembers(reflection);
    }

    // Type aliases have no members; show their definition as a single tokenized
    // row so its component types cross-link like any other signature.
    // An object-literal const documents like a namespace of members.
    if (isVariable(reflection.kind) && (reflection.type?.declaration?.children?.length ?? 0) > 0) {
        return buildObjectSections(reflection.type.declaration);
    }

    if (isTypeAlias(reflection.kind)) {
        const definitionTokens = tokenizeType(reflection.type);
        const definitionMember: ApiMember = {
            name: reflection.name,
            signature: tokensToText(definitionTokens),
            signatureTokens: definitionTokens,
            params: [],
            returnType: null,
            description: '',
        };
        return {
            sections: [
                {
                    id: 'definition',
                    title: 'Definition',
                    members: [definitionMember],
                    paragraphs: [],
                    importLine: null,
                    sourceLink: null,
                },
            ],
            counts: EMPTY_COUNTS,
            memberCount: 0,
        };
    }

    return { sections: [], counts: EMPTY_COUNTS, memberCount: 0 };
};

const entryPointTitle = (reflection: any): string => {
    const sourcePath = normalizePath(reflection.sources?.[0]?.fileName ?? '');
    const subsystem = guessSubsystem(sourcePath);
    if (subsystem === 'debug') return '@codexo/exojs/debug';
    if (subsystem === 'extensions') return '@codexo/exojs/extensions';
    return '@codexo/exojs';
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
    /** A same-named namespace reflection whose constants merge onto this page. */
    mergeNamespace?: any;
}

const emitReflection = (reflection: any, usedSlugs: Set<string>, options: EmitOptions): boolean => {
    // Documentable kinds plus object-literal variables (namespaces like
    // MathUtils), which build() routes here explicitly.
    if (!isDocumentableKind(reflection.kind) && !isVariable(reflection.kind)) return false;

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
    // A merged same-named namespace contributes a Constants section (e.g. the
    // GamepadButton.South / Pointer.X channel identifiers alongside the class).
    const constantsSection = options.mergeNamespace ? buildConstantsSection(options.mergeNamespace) : null;

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
        ...(constantsSection ? [constantsSection] : []),
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
        memberCount: memberCount + (constantsSection?.members.length ?? 0),
        counts,
        sections,
        ...(sourceRelative ? { sourcePath: sourceRelative } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
    };

    return finalizeAndWrite(data, usedSlugs);
};

/**
 * Assign a unique slug (from the symbol name), validate against the shared
 * schema (fail fast on drift), and write the JSON. Shared by emitReflection and
 * the synthetic emitters (object-collection variables, the functions page).
 */
const finalizeAndWrite = (data: ApiSymbolData, usedSlugs: Set<string>): boolean => {
    const baseSlug = slugify(data.symbol);
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
    }
    usedSlugs.add(slug);

    const result = apiSymbolSchema.safeParse(data);
    if (!result.success) {
        throw new Error(`Generated API data for "${data.symbol}" is invalid:\n${result.error.toString()}`);
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

const isNamespace = (kind: ReflectionKind): boolean => (kind & ReflectionKind.Namespace) > 0;

/**
 * Collect top-level namespace reflections (flattening the single- vs
 * multi-entry-point shapes like collectSymbols). Several engine symbols are a
 * class merged with a same-named namespace holding channel/id constants
 * (GamepadButton.South, Pointer.X, …); those constants are merged onto the
 * class page rather than emitted as a separate page.
 */
const collectNamespaces = (project: any): any[] => {
    const out: any[] = [];
    for (const child of project.children ?? []) {
        if (isNamespace(child.kind)) {
            out.push(child);
        } else if (Array.isArray(child.children) && (child.kind & ReflectionKind.Module) > 0) {
            for (const sub of child.children) {
                if (isNamespace(sub.kind)) out.push(sub);
            }
        }
    }
    return out;
};

/**
 * A "Constants" section from a namespace's members (each a named constant with
 * its type and JSDoc), reusing the value-member shape used for properties.
 */
const buildConstantsSection = (namespaceReflection: any): ApiSection | null => {
    const members: ApiMember[] = (namespaceReflection.children ?? [])
        .filter((child: any) => !child.name.startsWith('_'))
        .map((child: any) => buildValueMember(child.name, child.type ?? child.getSignature?.type, child.comment));
    if (members.length === 0) return null;
    return { id: 'constants', title: 'Constants', members, paragraphs: [], importLine: null, sourceLink: null };
};

/** Collect top-level free function + variable reflections (flattened). */
const collectExtras = (project: any): any[] => {
    const out: any[] = [];
    for (const child of project.children ?? []) {
        if (isFunction(child.kind) || isVariable(child.kind)) {
            out.push(child);
        } else if (Array.isArray(child.children) && (child.kind & ReflectionKind.Module) > 0) {
            for (const sub of child.children) {
                if (isFunction(sub.kind) || isVariable(sub.kind)) out.push(sub);
            }
        }
    }
    return out;
};

/**
 * Emit one aggregate page collecting a package's free functions and simple
 * constants (the ones that aren't object-literal namespaces or class/interface
 * merges), so they are documented without spawning dozens of thin pages.
 */
const emitFunctionsPage = (
    functions: any[],
    simpleVars: any[],
    importPath: string,
    subsystem: Subsystem,
    pageSymbol: string,
    usedSlugs: Set<string>,
): boolean => {
    if (functions.length === 0 && simpleVars.length === 0) return false;

    const functionMembers = functions
        .flatMap((fn: any) => (fn.signatures ?? []).map((signature: any) => buildCallableMember(fn.name, signature, fn.comment)))
        .sort((a, b) => a.name.localeCompare(b.name));
    const constMembers = simpleVars
        .map((v: any) => buildValueMember(v.name, v.type ?? v.getSignature?.type, v.comment))
        .sort((a, b) => a.name.localeCompare(b.name));

    const sections: ApiSection[] = [
        {
            id: 'overview',
            title: 'Overview',
            members: [],
            paragraphs: [`Free functions and constants exported from ${importPath}. Import any of them directly, for example \`import { ${functionMembers[0]?.name ?? constMembers[0]?.name} } from '${importPath}'\`.`],
            importLine: null,
            sourceLink: null,
        },
    ];
    if (functionMembers.length > 0) sections.push(toMemberSection('Functions', functionMembers));
    if (constMembers.length > 0) sections.push(toMemberSection('Constants', constMembers));

    const data: ApiSymbolData = {
        title: pageSymbol === 'Functions' ? 'Functions & Constants' : pageSymbol,
        description: `Free functions and constants exported from ${importPath}.`,
        symbol: pageSymbol,
        kind: 'namespace',
        subsystem,
        importPath,
        tier: 'stable',
        memberCount: functionMembers.length + constMembers.length,
        counts: { constructors: 0, methods: functionMembers.length, properties: constMembers.length, events: 0 },
        sections,
    };
    return finalizeAndWrite(data, usedSlugs);
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

    // 1. Core (+ debug and extensions subpaths).
    const coreProject = await convertEntryPoints(
        ['src/index.ts', 'src/debug/index.ts', 'src/extensions/index.ts'],
        'tsconfig.json',
    );
    const coreNamespaces = new Map<string, any>(collectNamespaces(coreProject).map((ns: any) => [ns.name, ns]));
    let coreCount = 0;
    const coreDocumentable = collectSymbols(coreProject);
    const coreNames = new Set<string>(coreDocumentable.map((r: any) => r.name));
    for (const reflection of coreDocumentable) {
        if (emitReflection(reflection, usedSlugs, { mergeNamespace: coreNamespaces.get(reflection.name) })) coreCount += 1;
    }

    // Free functions, object-literal namespaces (MathUtils, …) and simple
    // constants. Names that clash with a documented class/interface/type are a
    // merge partner already handled above, so they are skipped here.
    const coreExtras = collectExtras(coreProject).filter((e: any) => !coreNames.has(e.name));
    const coreObjectVars = coreExtras.filter((e: any) => isVariable(e.kind) && (e.type?.declaration?.children?.length ?? 0) > 0);
    const coreSimpleVars = coreExtras.filter((e: any) => isVariable(e.kind) && (e.type?.declaration?.children?.length ?? 0) === 0);
    const coreFunctions = coreExtras.filter((e: any) => isFunction(e.kind));
    for (const objectVar of coreObjectVars) {
        if (emitReflection(objectVar, usedSlugs, {})) coreCount += 1;
    }
    if (emitFunctionsPage(coreFunctions, coreSimpleVars, '@codexo/exojs', 'core', 'Functions', usedSlugs)) coreCount += 1;

    if (coreCount === 0) {
        throw new Error('TypeDoc conversion produced no exportable core symbols.');
    }

    // 2. Official extension packages — each as its own discoverable surface.
    const packageCounts: Array<{ importPath: string; count: number }> = [];
    for (const pkg of EXTENSION_PACKAGES) {
        const project = await convertEntryPoints([pkg.entryPoint], pkg.tsconfig);
        const namespaces = new Map<string, any>(collectNamespaces(project).map((ns: any) => [ns.name, ns]));
        let count = 0;
        const documentable = collectSymbols(project);
        const names = new Set<string>(documentable.map((r: any) => r.name));
        for (const reflection of documentable) {
            if (
                emitReflection(reflection, usedSlugs, {
                    importPathOverride: pkg.importPath,
                    subsystemOverride: pkg.subsystem,
                    sourceMarker: pkg.sourceMarker,
                    mergeNamespace: namespaces.get(reflection.name),
                })
            ) {
                count += 1;
            }
        }

        // The package's own free functions/variables (packages re-export core,
        // so filter to this package's source and drop merge-partner names).
        const ownExtras = collectExtras(project).filter(
            (e: any) => !names.has(e.name) && normalizePath(e.sources?.[0]?.fileName ?? '').includes(pkg.sourceMarker),
        );
        const objectVars = ownExtras.filter((e: any) => isVariable(e.kind) && (e.type?.declaration?.children?.length ?? 0) > 0);
        const simpleVars = ownExtras.filter((e: any) => isVariable(e.kind) && (e.type?.declaration?.children?.length ?? 0) === 0);
        const functions = ownExtras.filter((e: any) => isFunction(e.kind));
        for (const objectVar of objectVars) {
            if (emitReflection(objectVar, usedSlugs, { importPathOverride: pkg.importPath, subsystemOverride: pkg.subsystem })) count += 1;
        }
        const pageSymbol = `${pkg.subsystem[0].toUpperCase()}${pkg.subsystem.slice(1)} Functions`;
        if (emitFunctionsPage(functions, simpleVars, pkg.importPath, pkg.subsystem, pageSymbol, usedSlugs)) count += 1;

        if (count === 0) {
            throw new Error(`TypeDoc conversion produced no own symbols for ${pkg.importPath}.`);
        }
        packageCounts.push({ importPath: pkg.importPath, count });
    }

    const summary = [`${coreCount} core`, ...packageCounts.map(p => `${p.count} ${p.importPath}`)].join(', ');
    console.log(`[build:api] Generated ${usedSlugs.size} API page(s) (${summary}) in ${outputDir}`);
};

void build();
