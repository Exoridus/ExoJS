import resolve from '@rollup/plugin-node-resolve';
import cleaner from 'rollup-plugin-cleaner';
import { string } from 'rollup-plugin-string';
import typescript from 'rollup-plugin-typescript2';
import pkg from './package.json';

export default {
    input: 'src/index.ts',
    output: [
        {
            file: pkg.main,
            format: 'cjs',
        },
        {
            file: pkg.module,
            format: 'es',
        },
        {
            file: pkg.browser,
            format: 'iife',
            name: 'Exo',
        },
    ],
    plugins: [
        cleaner({
            targets: ['dist'],
        }),
        resolve({
            mainFields: ['module', 'main', 'browser'],
        }),
        string({
            include: [
                '**/*.vert',
                '**/*.frag',
            ],
        }),
        typescript({
            typescript: require('typescript'),
        }),
    ],
    external: [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
    ],
};