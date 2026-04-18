export interface ExampleRuntimeMeta {
    slug?: string;
    path?: string;
    title?: string;
    description?: string;
    backend?: 'core' | 'webgl2' | 'webgpu' | 'advanced' | string;
    notes?: Array<string>;
    unsupportedNote?: string;
    tags?: Array<string>;
    section?: string;
    order?: number;
    status?: string;
}

declare global {
    interface Window {
        __EXAMPLE_META__?: ExampleRuntimeMeta | null;
        __EXAMPLE_PREVIEW_AUTOPLAY__?: (() => void | Promise<void>) | null;
    }
}

declare module '@examples/runtime' {
    export function getExampleMeta(): ExampleRuntimeMeta;
    export function supportsWebGpu(): boolean;
    export function createInfoElement(maxWidth?: string): HTMLElement;
    export function showInfo(element: HTMLElement, title: string, detail: string, isError?: boolean): void;
    export function formatErrorMessage(error: unknown): string;
}

export {};
