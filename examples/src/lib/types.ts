export interface UrlParams {
  [param: string]: string | number;
}

export type ExampleBackend = 'core' | 'webgl2' | 'webgpu' | 'advanced';

export interface ExampleDefinition {
  slug: string;
  path: string;
  title: string;
  description: string;
  backend: ExampleBackend;
  notes?: Array<string>;
  unsupportedNote?: string;
  tags?: Array<string>;
  order?: number;
  status?: string;
}

export interface Example extends ExampleDefinition {
  section: string;
}

export interface ExamplesResponse {
  [directory: string]: Array<ExampleDefinition>;
}

export type ExamplesMap = Map<string, Array<Example>>;

export type AutoRendererStatus = 'checking' | 'webgpu' | 'webgl2' | 'unsupported';

export interface ExampleAvailability {
  available: boolean;
  reason: string | null;
}

export interface PreviewErrorEntry {
  summary: string;
  details?: string;
}
