import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

import { apiSymbolSchema } from './lib/api-schema';

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

// The API reference is generated as typed, structured JSON (one file per
// symbol) by site/scripts/build-api.ts. The schema lives in ./lib/api-schema
// so the generator validates its own output against the exact shape the pages
// consume via `entry.data` — no MDX body, no regex re-parse, no escape dance.
const api = defineCollection({
    loader: glob({ base: './src/content/api', pattern: '**/*.json' }),
    schema: apiSymbolSchema,
});

export const collections = { guide, api };
