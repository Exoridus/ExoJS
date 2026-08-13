/**
 * Return a deterministically ordered copy of union members. TypeScript and
 * TypeDoc may expose semantically identical unions in type-creation order,
 * which can change after an unrelated import. Source order is not part of a
 * union's meaning, so generated documentation sorts by rendered text.
 */
export function sortUnionMembers<T>(members: readonly T[], textOf: (member: T) => string): T[] {
    return [...members].sort((left, right) => {
        const leftText = textOf(left);
        const rightText = textOf(right);
        return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
    });
}
