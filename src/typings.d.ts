declare module '*.vert' {
  const content: string;
  export default content;
}

declare module '*.frag' {
  const content: string;
  export default content;
}

declare const __DEV__: boolean;
declare const __VERSION__: string;
declare const __REVISION__: string;
