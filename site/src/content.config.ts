import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guide = defineCollection({
    loader: glob({ base: './src/content/guide', pattern: '**/*.{md,mdx}' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        part: z.number().int().min(1).max(9),
        chapter: z.number().int().positive(),
        examples: z.array(z.string()).default([]),
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
