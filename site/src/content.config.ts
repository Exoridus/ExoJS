import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guide = defineCollection({
    loader: glob({ base: './src/content/guide', pattern: '**/*.{md,mdx}' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        chapter: z.string(),
        order: z.number().int().positive(),
    }),
});

const api = defineCollection({
    loader: glob({ base: './src/content/api', pattern: '**/*.{md,mdx}' }),
    schema: z.object({
        title: z.string(),
        description: z.string().default(''),
        symbol: z.string(),
        subsystem: z.enum(['animation', 'audio', 'core', 'debug', 'input', 'math', 'particles', 'rendering', 'resources']),
        importPath: z.string(),
        sourcePath: z.string().optional(),
        sourceUrl: z.string().optional(),
    }),
});

export const collections = { guide, api };
