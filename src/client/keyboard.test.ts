import { describe, expect, it } from "vitest";
import { actionForKey, isCharacterShortcut } from "./keyboard";

describe("isCharacterShortcut", () => {
  it("distinguishes printable shortcuts from navigation and modified keys", () => {
    expect(isCharacterShortcut({ key: "b", code: "KeyB" })).toBe(true);
    expect(isCharacterShortcut({ key: "?", code: "Slash" })).toBe(true);
    expect(isCharacterShortcut({ key: "ArrowRight", code: "ArrowRight" })).toBe(
      false,
    );
    expect(isCharacterShortcut({ key: " ", code: "Space" })).toBe(false);
    expect(isCharacterShortcut({ key: "z", code: "KeyZ", ctrlKey: true })).toBe(
      false,
    );
  });
});

describe("actionForKey", () => {
  it.each([
    ["ArrowLeft", false, "previous"],
    ["ArrowLeft", true, "previous-ten"],
    ["ArrowUp", false, "previous"],
    ["PageUp", false, "previous"],
    ["PageUp", true, "previous-slide"],
    ["ArrowRight", false, "next"],
    ["ArrowRight", true, "next-ten"],
    ["ArrowDown", false, "next"],
    ["PageDown", false, "next"],
    ["PageDown", true, "next-slide"],
    ["Space", false, "next"],
    ["Space", true, "history-forward"],
    ["Enter", false, "next"],
    ["NumpadEnter", false, "next"],
    ["Backspace", false, "previous"],
    ["Backspace", true, "history-back"],
    ["Home", false, "first"],
    ["Home", true, "previous-slide"],
    ["End", false, "last"],
    ["End", true, "next-slide"],
    ["KeyM", true, "saved"],
    ["KeyM", false, "bookmark"],
    ["KeyN", true, "next-physical"],
    ["KeyN", false, undefined],
    ["KeyP", true, "previous-physical"],
    ["KeyP", false, "toggle-timer"],
    ["KeyS", false, "start-timer"],
    ["KeyS", true, undefined],
    ["KeyG", false, "go-to-page"],
    ["KeyG", true, undefined],
    ["KeyO", false, "overview"],
    ["KeyO", true, undefined],
    ["KeyB", false, "blackout"],
    ["KeyW", false, "whiteout"],
    ["KeyF", false, "fullscreen"],
    ["KeyF", true, "toggle-freeze"],
    ["KeyD", false, "toggle-drawings"],
    ["KeyD", true, undefined],
    ["KeyC", false, "clear-drawings"],
    ["KeyC", true, undefined],
    ["Digit1", false, "normal-mode"],
    ["Numpad2", false, "laser-mode"],
    ["Digit3", false, "pen-mode"],
    ["Numpad4", false, "eraser-mode"],
    ["Digit5", false, "spotlight-mode"],
    ["Digit1", true, undefined],
    ["KeyA", true, "toggle-current-slide-size"],
    ["KeyA", false, undefined],
    ["KeyZ", false, undefined],
    ["KeyZ", true, undefined],
    ["KeyZ", false, "undo-drawing", false, true],
    ["KeyZ", true, "redo-drawing", false, true],
    ["KeyY", false, "redo-drawing", true, false],
    ["Escape", false, "reset-view"],
    ["Equal", false, "input-larger"],
    ["Equal", true, "input-larger"],
    ["NumpadAdd", false, "input-larger"],
    ["Minus", false, "input-smaller"],
    ["NumpadSubtract", false, "input-smaller"],
    ["Slash", true, "shortcuts"],
    ["Slash", false, "search"],
    ["KeyK", false, "search", true, false],
    ["KeyK", false, "search", false, true],
  ] as const)(
    "maps %s (shift: %s)",
    (code, shiftKey, expected, ctrlKey = false, metaKey = false) => {
      expect(
        actionForKey({
          code,
          shiftKey,
          repeat: false,
          isComposing: false,
          ctrlKey,
          metaKey,
        }),
      ).toBe(expected);
    },
  );

  it("repeats navigation without repeating commands", () => {
    expect(actionForKey({ code: "ArrowRight", repeat: true })).toBe("next");
    expect(actionForKey({ code: "KeyB", repeat: true })).toBeUndefined();
    expect(
      actionForKey({ code: "ArrowRight", isComposing: true }),
    ).toBeUndefined();
    expect(actionForKey({ code: "ArrowLeft", altKey: true })).toBeUndefined();
    expect(actionForKey({ code: "ArrowLeft", ctrlKey: true })).toBeUndefined();
    expect(actionForKey({ code: "ArrowLeft", metaKey: true })).toBeUndefined();
  });
});
