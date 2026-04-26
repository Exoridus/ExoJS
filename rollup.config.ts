import resolve from '@rollup/plugin-node-resolve';
import { string } from 'rollup-plugin-string';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import type { RollupOptions } from 'rollup';

const glslPlugin = string({
    include: ['**/*.vert', '**/*.frag'],
});

const bundledPlugins = [
    resolve({ mainFields: ['browser', 'module', 'main'] }),
    glslPlugin,
    commonjs(),
    typescript({
        compilerOptions: { incremental: false },
        outputToFilesystem: false,
    }),
];

const bundled: RollupOptions = {
    input: 'src/index.ts',
    output: [
        {
            file: 'dist/exo.esm.js',
            format: 'es',
            sourcemap: true,
        },
        {
            file: 'dist/exo.global.js',
            format: 'iife',
            name: 'Exo',
            sourcemap: true,
        },
    ],
    plugins: bundledPlugins,
};

const minified: RollupOptions = {
    input: 'src/index.ts',
    output: [
        {
            file: 'dist/exo.esm.min.js',
            format: 'es',
            sourcemap: true,
        },
        {
            file: 'dist/exo.global.min.js',
            format: 'iife',
            name: 'Exo',
            sourcemap: true,
        },
    ],
    plugins: [...bundledPlugins, terser()],
};

const modules: RollupOptions = {
    input: 'src/index.ts',
    output: {
        dir: 'dist/esm',
        format: 'es',
        sourcemap: true,
        preserveModules: true,
        preserveModulesRoot: 'src',
    },
    external: ['earcut'],
    plugins: [
        resolve({ mainFields: ['module', 'browser', 'main'] }),
        glslPlugin,
        commonjs(),
        typescript({
            compilerOptions: {
                incremental: false,
                outDir: 'dist/esm',
                declaration: true,
                declarationDir: 'dist/esm',
            },
        }),
    ],
};

export default [bundled, minified, modules];
