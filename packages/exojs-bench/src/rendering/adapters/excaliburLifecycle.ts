interface ChildParent<TChild> {
  removeChild(child: TChild): void;
  addChild(child: TChild): void;
}

/** Replaces a child without applying a second destruction lifecycle after removal. */
export const replaceExcaliburChild = <TActor, TLeaf extends { readonly actor: TActor }>(
  parent: ChildParent<TActor>,
  current: TActor,
  create: () => TLeaf,
): TLeaf => {
  parent.removeChild(current);

  const replacement = create();

  parent.addChild(replacement.actor);

  return replacement;
};
