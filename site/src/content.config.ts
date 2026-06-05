import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Guide ordering, grouping, and learning metadata live in
// src/lib/guide-structure.ts (the single source of truth, reconciled with these
// files by test/site/guide-structure.test.ts). Frontmatter only carries the
// prose that belongs next to the content: a title and a one-line description.
const guide = defineCollection({
    loader: glob({ base: './src/content/guide', pattern: '**/*.{md,mdx}' }),
    schema: z.object({
        title: z.string().min(1),
        description: z.string().min(1),
    }),
});

const api = defineCollection({
    loader: glob({ base: './src/content/api', pattern: '**/*.{md,mdx}' }),
    schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        symbol: z.string(),
        kind: z.enum(['class', 'enum', 'interface', 'type']),
        subsystem: z.enum(['animation', 'audio', 'core', 'debug', 'input', 'math', 'particles', 'rendering', 'resources']),
        importPath: z.string(),
        memberCount: z.number().int().min(0).default(0),
        sections: z.array(z.string()).default([]),
        sourcePath: z.string().optional(),
        sourceUrl: z.string().optional(),
    }),
});

export const collections = { guide, api };
