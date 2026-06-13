import type { CollectionEntry } from 'astro:content';

export type ApiEntry = CollectionEntry<'api'>;

export const API_SUBSYSTEM_ORDER = ['core', 'rendering', 'input', 'audio', 'animation', 'resources', 'math', 'debug', 'particles', 'tilemap', 'tiled'] as const;

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

