declare module '*.vert' {
  const content: string;
  export default content;
}

declare module '*.frag' {
  const content: string;
  export default content;
}

declare const __BUILD_ENV__: 'development' | 'production';
declare const __COMMIT_SHA__: string;
declare const __DEV__: boolean;
declare const __VERSION__: string;
