import resolve from '@rollup/plugin-node-resolve';
import { string } from 'rollup-plugin-string';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

function createPlugins() {
    return [
        resolve({
            mainFields: ['module', 'main', 'browser'],
        }),
        string({
            include: [
                '**/*.vert',
                '**/*.frag',
            ],
        }),
        commonjs(),
        typescript({
            compilerOptions: {
                incremental: false,
            },
            outputToFilesystem: false,
        }),
    ];
}

export default [
    {
        input: 'src/index.ts',
        output: [
            {
                file: 'dist/exo.js',
                format: 'cjs',
                sourcemap: true,
            },
            {
                file: 'dist/exo.esm.js',
                format: 'es',
                sourcemap: true,
            },
            {
                file: 'dist/exo.bundle.js',
                format: 'iife',
                name: 'Exo',
                sourcemap: true,
            },
        ],
        plugins: createPlugins(),
    },
    {
        input: 'src/webgl2.ts',
        output: [
            {
                file: 'dist/webgl2.js',
                format: 'cjs',
                sourcemap: true,
            },
            {
                file: 'dist/webgl2.esm.js',
                format: 'es',
                sourcemap: true,
            },
        ],
        plugins: createPlugins(),
    },
    {
        input: 'src/webgpu.ts',
        output: [
            {
                file: 'dist/webgpu.js',
                format: 'cjs',
                sourcemap: true,
            },
            {
                file: 'dist/webgpu.esm.js',
                format: 'es',
                sourcemap: true,
            },
        ],
        plugins: createPlugins(),
    },
];
