interface WebGLDebugUtils {
    glEnumToString(value: number): string;
    glFunctionArgsToString(functionName: string, args: Array<unknown>): string;
    makeDebugContext(
        context: WebGL2RenderingContext,
        onError?: (err: number, funcName: string, args: Array<unknown>) => void,
        onFunc?: (funcName: string, args: Array<unknown>) => void,
        context2?: WebGL2RenderingContext,
    ): WebGL2RenderingContext;
}

declare const WebGLDebugUtils: WebGLDebugUtils;
export default WebGLDebugUtils;
