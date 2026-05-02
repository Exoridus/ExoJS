import resolve from '@rollup/plugin-node-resolve';
import { string } from 'rollup-plugin-string';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import type { RollupOptions } from 'rollup';

const glslPlugin = string({
    include: ['**/*.vert', '**/*.frag'],
});

const bundled: RollupOptions = {
    input: 'src/index.ts',
    output: {
        file: 'dist/exo.esm.js',
        format: 'es',
        sourcemap: true,
    },
    plugins: [
        resolve({ mainFields: ['browser', 'module', 'main'] }),
        glslPlugin,
        commonjs(),
        typescript({
            compilerOptions: { incremental: false },
            outputToFilesystem: false,
        }),
    ],
};

const modules: RollupOptions = {
    input: ['src/index.ts', 'src/debug/index.ts'],
    output: {
        dir: 'dist/esm',
        format: 'es',
        sourcemap: true,
        preserveModules: true,
        preserveModulesRoot: 'src',
    },
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

export default [bundled, modules];
