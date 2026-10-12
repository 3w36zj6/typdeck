import { For } from "solid-js";

const shortcuts = [
  ["← / ↑ / PageUp", "Previous slide"],
  ["→ / ↓ / PageDown / Space", "Next slide"],
  ["Enter / Backspace", "Next / previous slide"],
  ["Shift + Backspace / Space", "Back / forward in slide history"],
  ["Home / End", "First / last slide"],
  ["Shift + PageUp / PageDown / Home / End", "Previous / next logical slide"],
  ["Shift + ← / →", "Move backward / forward by 10 pages"],
  ["M", "Bookmark the current logical slide"],
  ["Shift+M", "Return to the bookmark or source-defined saved slide"],
  [
    "Shift+N / Shift+P",
    "Next / previous physical page, including hidden slides",
  ],
  ["G", "Go to a physical page number"],
  ["O", "Open the slide overview"],
  ["/ / Ctrl/Cmd+K", "Search slide text"],
  ["F", "Enter / exit fullscreen"],
  ["Shift+F", "Freeze / unfreeze the stage (Presenter View)"],
  ["S / P", "Start / pause or resume the timer (Presenter View)"],
  ["B", "Toggle blackout"],
  ["W", "Toggle whiteout"],
  ["?", "Open this list"],
  ["Esc", "Close dialogs or reset temporary presentation modes"],
  ["D", "Hide / show drawings (Presenter View)"],
  ["C", "Clear drawings on the current slide (Presenter View)"],
  [
    "1 / 2 / 3 / 4 / 5",
    "Normal / laser / pen / eraser / spotlight mode (Presenter View)",
  ],
  ["Shift+A", "Maximize / restore the current slide (Presenter View)"],
  ["+ / −", "Resize the active input tool (Presenter View)"],
  [
    "Ctrl/Cmd+Z / Ctrl/Cmd+Y / Ctrl/Cmd+Shift+Z",
    "Undo / redo while drawing (Presenter View)",
  ],
] as const;

export const ShortcutDialog = (props: {
  characterShortcutsEnabled: boolean;
  onCharacterShortcutsEnabledChange: (enabled: boolean) => void;
  setDialog: (dialog: HTMLDialogElement) => void;
}) => (
  <dialog
    ref={props.setDialog}
    aria-label="Keyboard shortcuts"
    class="shortcut-dialog"
    onClick={(event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <div>
      <h2>Keyboard shortcuts</h2>
      <label class="character-shortcuts-toggle">
        <input
          type="checkbox"
          checked={props.characterShortcutsEnabled}
          onChange={(event) =>
            props.onCharacterShortcutsEnabledChange(event.currentTarget.checked)
          }
        />
        Enable letter, number, and symbol shortcuts
      </label>
      <dl>
        <For each={shortcuts}>
          {([keys, description]) => (
            <>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{description}</dd>
            </>
          )}
        </For>
      </dl>
      <button
        type="button"
        onClick={(event) => event.currentTarget.closest("dialog")?.close()}
      >
        Close
      </button>
    </div>
  </dialog>
);
