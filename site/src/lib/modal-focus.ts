const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let scrollLockCount = 0;
let previousBodyOverflow = '';

/** Keeps a modal's keyboard and pointer interaction inside its visible surface. */
export const activateModalFocus = (root: HTMLElement, onClose: () => void, getOpener: () => HTMLElement | null): (() => void) => {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backgrounds: Array<{ element: HTMLElement; inert: boolean; hidden: string | null }> = [];

  for (let branch: HTMLElement | null = root; branch?.parentElement; branch = branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute('data-modal-backdrop')) {
        continue;
      }

      backgrounds.push({ element: sibling, inert: sibling.inert, hidden: sibling.getAttribute('aria-hidden') });
      sibling.inert = true;
      sibling.setAttribute('aria-hidden', 'true');
    }
  }

  if (scrollLockCount++ === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  const focusables = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      element =>
        !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
    );

  const focusFirst = (): void => {
    const initial = root.querySelector<HTMLElement>('[data-modal-initial-focus]');
    (initial ?? focusables()[0] ?? root).focus({ preventScroll: true });
  };

  let frame = 0;

  const focusWhenVisible = (): void => {
    // The sheet enters from visibility:hidden. Its first animation frame can
    // still be hidden, and browsers silently ignore focus on that frame.
    if (getComputedStyle(root).visibility === 'hidden') {
      frame = requestAnimationFrame(focusWhenVisible);

      return;
    }

    focusFirst();
  };

  frame = requestAnimationFrame(focusWhenVisible);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (root.closest('[inert]')) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const elements = focusables();
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;

    if (!first || !last) {
      event.preventDefault();
      root.focus();
    } else if (!root.contains(active) || active === root || (event.shiftKey && active === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (): void => {
    if (!root.closest('[inert]') && !root.contains(document.activeElement)) {
      focusFirst();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocusIn);

  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocusIn);

    for (const { element, inert, hidden } of backgrounds) {
      element.inert = inert;

      if (hidden === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', hidden);
      }
    }

    if (--scrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
    }

    const opener =
      previousFocus?.isConnected &&
      previousFocus !== document.body &&
      previousFocus !== document.documentElement &&
      !root.contains(previousFocus) &&
      !previousFocus.closest('[inert], [hidden]') &&
      previousFocus.getClientRects().length > 0 &&
      getComputedStyle(previousFocus).visibility !== 'hidden'
        ? previousFocus
        : getOpener();

    if (opener?.isConnected && !opener.closest('[inert]')) {
      opener.focus({ preventScroll: true });
    }
  };
};
