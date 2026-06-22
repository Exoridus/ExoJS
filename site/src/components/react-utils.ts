export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter((part): part is string => Boolean(part)).join(' ');
}

export function css(styles: Record<string, string>, name: string): string {
    return styles[name] ?? name;
}
