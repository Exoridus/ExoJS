import type { CollectionEntry } from 'astro:content';

export type ApiEntry = CollectionEntry<'api'>;

export const API_SUBSYSTEM_ORDER = ['core', 'rendering', 'input', 'audio', 'animation', 'resources', 'math', 'debug', 'particles', 'tilemap', 'tiled', 'physics', 'aseprite', 'ldtk'] as const;

export type ApiSubsystem = (typeof API_SUBSYSTEM_ORDER)[number];

export const API_SUBSYSTEM_META: Record<ApiSubsystem, { label: string; description: string }> = {
    core: {
        label: 'Core',
        description: 'Application lifecycle, scenes, and runtime coordination.',
    },
    rendering: {
        label: 'Drawing / Rendering',
        description: 'Drawables, renderer backends, views, and filter systems.',
    },
    input: {
        label: 'Input',
        description: 'Keyboard, pointer, touch, and gamepad abstractions.',
    },
    audio: {
        label: 'Audio',
        description: 'Playback, analysis, spatialization, and effect chains.',
    },
    particles: {
        label: 'Particles (official extension)',
        description: 'The @codexo/exojs-particles package: particle systems, modules, distributions, and GPU-backed simulation.',
    },
    animation: {
        label: 'Animation',
        description: 'Tweens, timing helpers, and motion utilities.',
    },
    resources: {
        label: 'Resources',
        description: 'Loader, manifests, asset factories, and caching strategies.',
    },
    math: {
        label: 'Math',
        description: 'Vectors, bounds, geometry, and collision primitives.',
    },
    debug: {
        label: 'Debug / Tooling',
        description: 'Debug layers, overlays, and inspection helpers.',
    },
    tilemap: {
        label: 'Tilemap (official extension)',
        description: 'The @codexo/exojs-tilemap package: generic tilemap runtime, chunks, layers, and views.',
    },
    tiled: {
        label: 'Tiled (official extension)',
        description: 'The @codexo/exojs-tiled package: load Tiled (.tmj) tilemaps through the loader.',
    },
    physics: {
        label: 'Physics (official extension)',
        description: 'The @codexo/exojs-physics package: rigid bodies, colliders, joints, sleeping, CCD, queries, and the TGS-Soft solver.',
    },
    aseprite: {
        label: 'Aseprite (official extension)',
        description: 'The @codexo/exojs-aseprite package: load Aseprite sprite sheets and their frame/tag animation data.',
    },
    ldtk: {
        label: 'LDtk (official extension)',
        description: 'The @codexo/exojs-ldtk package: load LDtk levels and layers through the loader.',
    },
};

export const FEATURED_SYMBOLS = ['application', 'scene', 'sprite', 'texture'] as const;

export type MemberCounts = {
    constructors: number;
    methods: number;
    properties: number;
    events: number;
};

export const parseMemberCounts = (body: string): MemberCounts => {
    let section = '';
    const counts: MemberCounts = { constructors: 0, methods: 0, properties: 0, events: 0 };

    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        const headingMatch = /^##\s+(.+)$/.exec(line);
        if (headingMatch) {
            section = headingMatch[1].toLowerCase();
            continue;
        }

        if (!line.startsWith('- `')) continue;

        if (section === 'constructors') counts.constructors += 1;
        else if (section === 'methods') counts.methods += 1;
        else if (section === 'properties') counts.properties += 1;
        else if (section === 'events') counts.events += 1;
    }

    return counts;
};

export const compactDescription = (value: string, maxLength = 140): string => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

export const toApiHref = (baseUrl: string, symbol: string): string => `${baseUrl}en/api/${symbol}/`;

export type ApiRow = {
    signature: string;
    description: string;
};

export type ParsedSection = {
    id: string;
    title: string;
    rows: ApiRow[];
    paragraphs: string[];
    importLine: string | null;
    sourceLink: { label: string; href: string } | null;
};

export const toAnchor = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

/**
 * Inverse of the generator's `escapeMdxText` (site/scripts/build-api.ts):
 * that function doubles backslashes, then escapes `{`, `}`, and `<` with a
 * leading backslash. Undo in the opposite order — first drop the
 * single-backslash escapes in front of `{`, `}`, `<`, then collapse the
 * remaining doubled backslashes back to single ones.
 */
export const cleanText = (value: string): string => value.replace(/\\([{}<])/g, '$1').replace(/\\\\/g, '\\');

const parseParagraphs = (lines: string[]): string[] => {
    const paragraphs: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
        if (buffer.length === 0) return;
        paragraphs.push(cleanText(buffer.join(' ').trim()));
        buffer = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flush();
            continue;
        }
        if (line.startsWith('- `')) {
            flush();
            continue;
        }
        if (/^`[^`]+`$/.test(line)) {
            flush();
            continue;
        }
        if (/^\[[^\]]+\]\(([^)]+)\)$/.test(line)) {
            flush();
            continue;
        }
        buffer.push(line);
    }

    flush();
    return paragraphs;
};

export const parseSections = (body: string): ParsedSection[] => {
    const sections: Array<{ title: string; lines: string[] }> = [];
    let active: { title: string; lines: string[] } | null = null;

    for (const rawLine of body.split('\n')) {
        const headingMatch = /^##\s+(.+)$/.exec(rawLine.trim());
        if (headingMatch) {
            if (active) sections.push(active);
            active = { title: headingMatch[1].trim(), lines: [] };
            continue;
        }
        if (active) active.lines.push(rawLine);
    }

    if (active) sections.push(active);

    return sections.map(section => {
        const rows: ApiRow[] = [];
        let importLine: string | null = null;
        let sourceLink: { label: string; href: string } | null = null;

        for (const rawLine of section.lines) {
            const line = rawLine.trim();
            if (!line) continue;

            if (!importLine) {
                const importMatch = /^`([^`]+)`$/.exec(line);
                if (importMatch) {
                    importLine = cleanText(importMatch[1]);
                    continue;
                }
            }

            if (!sourceLink) {
                const sourceMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(line);
                if (sourceMatch) {
                    sourceLink = { label: cleanText(sourceMatch[1]), href: sourceMatch[2] };
                    continue;
                }
            }

            const rowMatch = /^-\s+`([^`]+)`(?:\s*[-:]\s*(.+))?$/.exec(line);
            if (rowMatch) {
                rows.push({
                    signature: cleanText(rowMatch[1]),
                    description: cleanText(rowMatch[2] ?? ''),
                });
            }
        }

        return {
            id: toAnchor(section.title),
            title: section.title,
            rows,
            paragraphs: parseParagraphs(section.lines),
            importLine,
            sourceLink,
        };
    });
};

