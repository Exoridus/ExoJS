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

type Subsystem = 'animation' | 'audio' | 'core' | 'debug' | 'input' | 'math' | 'particles' | 'rendering' | 'resources';
type ApiKind = 'class' | 'enum';

const SUBSYSTEMS: ReadonlyArray<Subsystem> = ['animation', 'audio', 'core', 'debug', 'input', 'math', 'particles', 'rendering', 'resources'];

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

const renderClassMembers = (reflection: any): { body: string; sections: string[]; memberCount: number } => {
    const children = reflection.children ?? [];
    const constructors = children.filter((child: any) => (child.kind & ReflectionKind.Constructor) > 0);
    const methods = children.filter((child: any) => (child.kind & ReflectionKind.Method) > 0);
    const properties = children.filter((child: any) => (child.kind & ReflectionKind.Property) > 0);
    const events = properties.filter((property: any) => property.name.startsWith('on') && renderType(property.type).startsWith('Signal<'));
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
        const lines = plainProperties.map((property: any) => `- \`${property.name}: ${renderType(property.type)}\``);
        blocks.push(`## Properties\n\n${lines.join('\n')}`);
        sections.push('Properties');
    }

    if (events.length > 0) {
        const lines = events.map((event: any) => `- \`${event.name}: ${renderType(event.type)}\``);
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

const build = async (): Promise<void> => {
    const app = await Application.bootstrapWithPlugins({
        entryPoints: [toPosix(path.resolve(repoRoot, 'src/index.ts')), toPosix(path.resolve(repoRoot, 'src/debug/index.ts'))],
        tsconfig: toPosix(path.resolve(repoRoot, 'tsconfig.json')),
        excludeInternal: true,
    });

    const project = await app.convert();
    if (!project) {
        throw new Error('TypeDoc conversion failed.');
    }

    ensureCleanOutput();
    const usedSlugs = new Set<string>();

    const modules = project.children ?? [];
    for (const moduleReflection of modules) {
        const exported = moduleReflection.children ?? [];
        for (const reflection of exported) {
            if (!isDocumentableKind(reflection.kind)) continue;

            const source = reflection.sources?.[0];
            const sourcePath = source?.fileName ? normalizePath(source.fileName) : undefined;
            const subsystem = guessSubsystem(sourcePath ?? '');
            const importPath = entryPointTitle(reflection);
            const description = renderComment(reflection.comment);
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

            const sourceRelative = sourcePath ? sourcePath.replace(/^.*\/src\//, 'src/') : undefined;
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
        }
    }

    if (usedSlugs.size === 0) {
        throw new Error('TypeDoc conversion produced no exportable symbols.');
    }

    console.log(`[build:api] Generated ${usedSlugs.size} API page(s) in ${outputDir}`);
};

void build();
