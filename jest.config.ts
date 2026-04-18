import type { Config } from 'jest';

const config: Config = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        '^(audio|core|input|math|particles|physics|rendering|resources|vendor)/(.*)$': '<rootDir>/src/$1/$2',
        '\\.(vert|frag)$': '<rootDir>/test/mocks/text-file.ts',
    },
    transform: {
        '^.+\\.[tj]s$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.test.json',
            },
        ],
    },
};

export default config;
