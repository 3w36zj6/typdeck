import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFPageView,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";

type PdfSlideProps = {
  document: PDFDocumentProxy;
  page: number;
  label: string;
  opacity?: number;
  onNavigate?: (page: number) => void;
};

const PDF_TO_CSS_UNITS = 96 / 72;

export const PdfSlide = (props: PdfSlideProps) => {
  let host!: HTMLDivElement;
  let viewer!: HTMLDivElement;
  let displayedView: PDFPageView | undefined;
  const [error, setError] = createSignal<string>();

  createEffect(() => {
    const document = props.document;
    const pageNumber = props.page;
    const label = props.label;
    const onNavigate = props.onNavigate;
    let disposed = false;
    let frame = 0;
    let renderedScale = 0;
    let pendingView: PDFPageView | undefined;
    let observer: ResizeObserver | undefined;
    setError(undefined);

    void document
      .getPage(pageNumber)
      .then((pdfPage) => {
        if (disposed) return;
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const eventBus = new EventBus();
        const linkService = new PDFLinkService({
          eventBus,
          externalLinkTarget: LinkTarget.BLANK,
        });
        linkService.setDocument(document);
        linkService.setViewer({
          currentPageNumber: pageNumber,
          pagesRotation: 0,
          isInPresentationMode: true,
          pageLabelToPageNumber: Number,
          scrollPageIntoView: ({
            pageNumber: target,
          }: {
            pageNumber: number;
          }) => onNavigate?.(target),
        });

        const render = () => {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(() => {
            if (disposed || host.clientWidth === 0 || host.clientHeight === 0)
              return;
            const scale = Math.min(
              host.clientWidth / baseViewport.width / PDF_TO_CSS_UNITS,
              host.clientHeight / baseViewport.height / PDF_TO_CSS_UNITS,
            );
            if (Math.abs(scale - renderedScale) < 0.001) return;
            renderedScale = scale;

            pendingView?.destroy();
            pendingView?.div.remove();
            const nextView = new PDFPageView({
              container: viewer,
              id: pageNumber,
              scale,
              defaultViewport: baseViewport,
              eventBus,
              layerProperties: { linkService },
            });
            pendingView = nextView;
            nextView.div.style.position = "absolute";
            nextView.div.style.visibility = "hidden";
            nextView.setPdfPage(pdfPage);
            void nextView.draw().then(
              () => {
                if (!disposed && pendingView === nextView) {
                  nextView.div.setAttribute("aria-label", label);
                  nextView.div.style.removeProperty("position");
                  nextView.div.style.removeProperty("visibility");
                  const previousView = displayedView;
                  displayedView = nextView;
                  pendingView = undefined;
                  viewer.replaceChildren(nextView.div);
                  previousView?.destroy();
                }
              },
              (cause: unknown) => {
                if (
                  !disposed &&
                  pendingView === nextView &&
                  !(
                    cause instanceof Error &&
                    cause.name === "RenderingCancelledException"
                  )
                ) {
                  pendingView = undefined;
                  nextView.destroy();
                  nextView.div.remove();
                  setError("Could not render this slide.");
                }
              },
            );
          });
        };

        observer = new ResizeObserver(render);
        observer.observe(host);
        render();
      })
      .catch(() => {
        if (!disposed) setError("Could not load this slide.");
      });

    onCleanup(() => {
      disposed = true;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      pendingView?.destroy();
      pendingView?.div.remove();
    });
  });

  onCleanup(() => {
    displayedView?.destroy();
  });

  return (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        overflow: "hidden",
        opacity: props.opacity ?? 1,
      }}
    >
      <div
        ref={viewer}
        class="pdfViewer singlePageView removePageBorders"
        style={{ padding: "0" }}
      />
      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
    </div>
  );
};
