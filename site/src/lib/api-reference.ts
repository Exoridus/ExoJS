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

export const compactDescription = (value: string, maxLength = 140): string => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

export const toApiHref = (baseUrl: string, symbol: string): string => `${baseUrl}en/api/${symbol}/`;

