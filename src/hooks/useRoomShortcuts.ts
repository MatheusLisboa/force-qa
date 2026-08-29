import { useEffect } from "react";
import { isModalOpen } from "./useModalA11y";

export function isShortcutTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(el.isContentEditable);
}

export function useRoomShortcuts(
  handlers: {
    onNew?: () => void;
    onSearch?: () => void;
    onMyCards?: () => void;
    onEscape?: () => void;
  },
  enabled = true
) {
  const { onNew, onSearch, onMyCards, onEscape } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const typing = isShortcutTypingTarget(event.target);
      const modalOpen = isModalOpen();

      if (event.key === "Escape") {
        if (modalOpen) return;
        if (!onEscape) return;
        event.preventDefault();
        onEscape();
        return;
      }

      if (typing || modalOpen) return;

      if (event.key === "n" || event.key === "N") {
        if (!onNew) return;
        event.preventDefault();
        onNew();
        return;
      }

      if (event.key === "/") {
        if (!onSearch) return;
        event.preventDefault();
        onSearch();
        return;
      }

      if (event.key === "m" || event.key === "M") {
        if (!onMyCards) return;
        event.preventDefault();
        onMyCards();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onNew, onSearch, onMyCards, onEscape]);
}
