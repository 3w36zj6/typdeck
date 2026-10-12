export const PageJumpDialog = (props: {
  pageCount: number;
  setDialog: (dialog: HTMLDialogElement) => void;
  setInput: (input: HTMLInputElement) => void;
  onConfirm: (page: number) => void;
}) => (
  <dialog
    ref={props.setDialog}
    aria-labelledby="page-jump-heading"
    class="shortcut-dialog"
    onClick={(event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("page");
        if (!(input instanceof HTMLInputElement)) return;
        props.onConfirm(input.valueAsNumber);
        event.currentTarget.closest("dialog")?.close();
      }}
    >
      <h2 id="page-jump-heading">Go to page</h2>
      <label>
        Page
        <input
          ref={props.setInput}
          name="page"
          type="number"
          min="1"
          max={props.pageCount}
          step="1"
          required
        />
      </label>
      <button type="submit">Go</button>
      <button
        type="button"
        onClick={(event) => event.currentTarget.closest("dialog")?.close()}
      >
        Cancel
      </button>
    </form>
  </dialog>
);
