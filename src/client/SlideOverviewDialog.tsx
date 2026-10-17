import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import {
  headingForPage,
  logicalSlideStartPage,
  overviewPages,
  pageLabel,
} from "./presentation";
import { PdfSlide } from "./PdfSlide";
import type { Metadata } from "./types/metadata";

export const SlideOverviewDialog = (props: {
  document: PDFDocumentProxy;
  metadata: Metadata;
  currentPage: number;
  setDialog: (dialog: HTMLDialogElement) => void;
  onConfirm: (page: number) => void;
}) => {
  let list!: HTMLOListElement;
  const minimumHeadingLevel = createMemo(() =>
    props.metadata.outline.length
      ? Math.min(...props.metadata.outline.map(({ level }) => level))
      : 1,
  );
  const levelForPage = (page: number) =>
    (headingForPage(props.metadata, page)?.level ?? minimumHeadingLevel()) -
    minimumHeadingLevel() +
    1;

  return (
    <dialog
      ref={props.setDialog}
      aria-labelledby="overview-heading"
      class="shortcut-dialog overview-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        if (
          !(event.target instanceof HTMLButtonElement) ||
          !list.contains(event.target)
        ) {
          return;
        }
        if (event.code === "Enter" && event.shiftKey) {
          event.preventDefault();
          props.onConfirm(
            logicalSlideStartPage(props.metadata, Number(event.target.value)),
          );
          return;
        }
        const buttons = [...list.querySelectorAll<HTMLButtonElement>("button")];
        const columns =
          getComputedStyle(list).gridTemplateColumns.split(" ").length;
        const offsets: Record<string, number> = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -columns,
          PageUp: -columns,
          ArrowDown: columns,
          PageDown: columns,
        };
        const offset = offsets[event.code] ?? 0;
        if (!offset) return;
        const target = buttons[buttons.indexOf(event.target) + offset];
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}
    >
      <div>
        <div class="overview-header">
          <h2 id="overview-heading">Slide overview</h2>
          <button
            type="button"
            onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          >
            Close
          </button>
        </div>
        <ol ref={list} class="overview-grid" aria-label="Slides">
          <For each={overviewPages(props.metadata)}>
            {(page) => {
              const label = pageLabel(props.metadata, page);
              const [thumbnail, setThumbnail] = createSignal<HTMLSpanElement>();
              const [visible, setVisible] = createSignal(false);
              createEffect(() => {
                const element = thumbnail();
                if (!element) return;
                const observer = new IntersectionObserver(
                  (entries) =>
                    setVisible(
                      entries.some(
                        ({ intersectionRatio }) => intersectionRatio > 0,
                      ),
                    ),
                  { root: list, rootMargin: "200px 0px" },
                );
                observer.observe(element);
                onCleanup(() => observer.disconnect());
              });
              return (
                <li aria-level={levelForPage(page)}>
                  <button
                    type="button"
                    value={String(page)}
                    autofocus={props.currentPage === page}
                    aria-current={
                      props.currentPage === page ? "page" : undefined
                    }
                    aria-label={label}
                    onClick={() => props.onConfirm(page)}
                  >
                    <span ref={setThumbnail} class="overview-thumbnail" inert>
                      <Show when={visible()}>
                        <PdfSlide
                          document={props.document}
                          page={page}
                          label={`Thumbnail: ${label}`}
                        />
                      </Show>
                    </span>
                    <span
                      class="overview-label"
                      style={{
                        "padding-left": `${(levelForPage(page) - 1) * 1.2}em`,
                      }}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              );
            }}
          </For>
        </ol>
      </div>
    </dialog>
  );
};
