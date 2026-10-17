import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  createDeferred,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
} from "solid-js";
import { pageLabel } from "./presentation";
import { PdfSlide } from "./PdfSlide";
import {
  MAX_SEARCH_QUERY_LENGTH,
  searchSlides,
  type SearchableSlide,
} from "./slideSearch";
import type { Metadata } from "./types/metadata";

export const SlideSearchDialog = (props: {
  document: PDFDocumentProxy;
  metadata: Metadata;
  slides: SearchableSlide[] | undefined;
  loading: boolean;
  error: unknown;
  selectedPage: number;
  setDialog: (dialog: HTMLDialogElement) => void;
  setInput: (input: HTMLInputElement) => void;
  onSelect: (page: number) => void;
  onConfirm: (page: number) => void;
}) => {
  const [query, setQuery] = createSignal("");
  const deferredQuery = createDeferred(query, { timeoutMs: 150 });
  const results = createMemo(() =>
    searchSlides(props.slides ?? [], deferredQuery()),
  );

  createEffect(
    on(results, (matches) => {
      const first = matches[0];
      if (first) props.onSelect(first.page);
    }),
  );

  return (
    <dialog
      ref={props.setDialog}
      aria-labelledby="search-heading"
      class="shortcut-dialog search-dialog"
      onClose={() => setQuery("")}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (results().some(({ page }) => page === props.selectedPage)) {
            props.onConfirm(props.selectedPage);
          }
        }}
      >
        <h2 id="search-heading">Search slides</h2>
        <label>
          Slide text
          <input
            ref={props.setInput}
            type="search"
            value={query()}
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            onInput={(event) => setQuery(event.currentTarget.value)}
            autocomplete="off"
            placeholder="Type at least 2 characters"
          />
        </label>
        <Show when={props.loading}>
          <p role="status">Indexing slide text…</p>
        </Show>
        <Show when={props.error}>
          <p role="alert">Could not read slide text.</p>
        </Show>
        <Show
          when={!props.loading && !props.error && query().trim().length >= 2}
        >
          <p role="status">
            {results().length} {results().length === 1 ? "slide" : "slides"}
          </p>
          <Show when={results().length > 0}>
            <div class="search-content">
              <ol aria-label="Search results">
                <For each={results()}>
                  {(result) => (
                    <li>
                      <button
                        type="button"
                        aria-current={
                          props.selectedPage === result.page
                            ? "page"
                            : undefined
                        }
                        onClick={() => props.onSelect(result.page)}
                      >
                        <span>{pageLabel(props.metadata, result.page)}</span>
                        <small>{result.excerpt}</small>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
              <div class="search-preview">
                <PdfSlide
                  document={props.document}
                  page={props.selectedPage}
                  label={`Preview: ${pageLabel(props.metadata, props.selectedPage)}`}
                  onNavigate={props.onSelect}
                />
              </div>
            </div>
          </Show>
        </Show>
        <div class="search-actions">
          <button
            type="button"
            onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              !results().some(({ page }) => page === props.selectedPage)
            }
          >
            Go to slide
          </button>
        </div>
      </form>
    </dialog>
  );
};
