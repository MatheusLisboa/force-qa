import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const closeStack: Array<() => void> = [];

export function isModalOpen(): boolean {
  return closeStack.length > 0;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  dialogRef: RefObject<HTMLElement | null>,
  options?: { trapFocus?: boolean }
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const trap = options?.trapFocus !== false;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const closer = () => onCloseRef.current();
    closeStack.push(closer);

    const handleKeyDown = (event: KeyboardEvent) => {
      const isTop = closeStack[closeStack.length - 1] === closer;
      if (!isTop) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closer();
        return;
      }

      if (event.key === "Tab" && trap) {
        trapFocus(event, dialogRef.current as HTMLElement);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const frame = requestAnimationFrame(() => {
      if (!trap) return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const index = closeStack.lastIndexOf(closer);
      if (index >= 0) closeStack.splice(index, 1);
      if (trap) previouslyFocused?.focus();
    };
  }, [isOpen, dialogRef, trap]);
}
