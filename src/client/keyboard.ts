export const isCharacterShortcut = ({
  key,
  code,
  altKey = false,
  ctrlKey = false,
  metaKey = false,
}: Pick<KeyboardEvent, "key" | "code"> &
  Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey">>) =>
  key.length === 1 && code !== "Space" && !altKey && !ctrlKey && !metaKey;

export const actionForKey = ({
  code,
  shiftKey = false,
  repeat = false,
  isComposing = false,
  altKey = false,
  ctrlKey = false,
  metaKey = false,
}: Pick<KeyboardEvent, "code"> &
  Partial<
    Pick<
      KeyboardEvent,
      "shiftKey" | "repeat" | "isComposing" | "altKey" | "ctrlKey" | "metaKey"
    >
  >) => {
  if (
    isComposing ||
    altKey ||
    (repeat &&
      ![
        "ArrowLeft",
        "ArrowUp",
        "PageUp",
        "ArrowRight",
        "ArrowDown",
        "PageDown",
        "Space",
        "Enter",
        "NumpadEnter",
        "Backspace",
      ].includes(code))
  ) {
    return;
  }
  if (ctrlKey || metaKey) {
    if (code === "KeyZ") return shiftKey ? "redo-drawing" : "undo-drawing";
    if (code === "KeyY" && !shiftKey) return "redo-drawing";
    if (code === "KeyK" && !shiftKey) return "search";
    return;
  }
  switch (code) {
    case "ArrowLeft":
      return shiftKey ? "previous-ten" : "previous";
    case "ArrowUp":
      return "previous";
    case "PageUp":
      return shiftKey ? "previous-slide" : "previous";
    case "ArrowRight":
      return shiftKey ? "next-ten" : "next";
    case "ArrowDown":
      return "next";
    case "PageDown":
      return shiftKey ? "next-slide" : "next";
    case "Space":
      return shiftKey ? "history-forward" : "next";
    case "Enter":
    case "NumpadEnter":
      return shiftKey ? undefined : "next";
    case "Backspace":
      return shiftKey ? "history-back" : "previous";
    case "Home":
      return shiftKey ? "previous-slide" : "first";
    case "End":
      return shiftKey ? "next-slide" : "last";
    case "KeyM":
      return shiftKey ? "saved" : "bookmark";
    case "KeyN":
      return shiftKey ? "next-physical" : undefined;
    case "KeyP":
      return shiftKey ? "previous-physical" : "toggle-timer";
    case "KeyS":
      return shiftKey ? undefined : "start-timer";
    case "KeyG":
      return shiftKey ? undefined : "go-to-page";
    case "KeyO":
      return shiftKey ? undefined : "overview";
    case "KeyB":
      return "blackout";
    case "KeyW":
      return "whiteout";
    case "KeyF":
      return shiftKey ? "toggle-freeze" : "fullscreen";
    case "KeyD":
      return shiftKey ? undefined : "toggle-drawings";
    case "KeyC":
      return shiftKey ? undefined : "clear-drawings";
    case "Digit1":
    case "Numpad1":
      return shiftKey ? undefined : "normal-mode";
    case "Digit2":
    case "Numpad2":
      return shiftKey ? undefined : "laser-mode";
    case "Digit3":
    case "Numpad3":
      return shiftKey ? undefined : "pen-mode";
    case "Digit4":
    case "Numpad4":
      return shiftKey ? undefined : "eraser-mode";
    case "Digit5":
    case "Numpad5":
      return shiftKey ? undefined : "spotlight-mode";
    case "KeyA":
      return shiftKey ? "toggle-current-slide-size" : undefined;
    case "Escape":
      return "reset-view";
    case "Equal":
    case "NumpadAdd":
      return "input-larger";
    case "Minus":
    case "NumpadSubtract":
      return "input-smaller";
    case "Slash":
      return shiftKey ? "shortcuts" : "search";
  }
};
