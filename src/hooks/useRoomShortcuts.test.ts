import { describe, expect, it } from "vitest";
import { isShortcutTypingTarget } from "./useRoomShortcuts";

describe("isShortcutTypingTarget", () => {
  it("treats form fields as typing targets", () => {
    expect(isShortcutTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isShortcutTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isShortcutTypingTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isShortcutTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isShortcutTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
});
