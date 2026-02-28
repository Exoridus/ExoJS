import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        '^(audio|core|input|math|particles|rendering|resources|types|utils|vendor)/(.*)$': '<rootDir>/src/$1/$2',
        '\\.(vert|frag)$': '<rootDir>/test/mocks/text-file.ts',
    },
    transform: {
        '^.+\\.[tj]s$': [
            'ts-jest',
            {
                tsconfig: 'tsconfig.json',
            },
        ],
    },
};

export default config;
