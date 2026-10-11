import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFPageView,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import type { SlidePoint, SlidePointer } from "./presentation";

type PdfSlideProps = {
  document: PDFDocumentProxy;
  page: number;
  label: string;
  opacity?: number;
  pointer?: SlidePointer;
  onNavigate?: (page: number) => void;
  onPointerMove?: (point: SlidePoint | undefined) => void;
};

const PDF_TO_CSS_UNITS = 96 / 72;

export const PdfSlide = (props: PdfSlideProps) => {
  let host!: HTMLDivElement;
  let viewer!: HTMLDivElement;
  let pointerDot!: HTMLSpanElement;
  let spotlightLayer!: HTMLDivElement;
  let displayedView: PDFPageView | undefined;
  let displayedPage: number | undefined;
  const [error, setError] = createSignal<string>();

  const currentPageElement = (page: number) =>
    displayedPage === page ? displayedView?.div : undefined;

  const positionPointer = (
    pointer: SlidePointer | undefined,
    pageNumber: number,
  ) => {
    const page = currentPageElement(pageNumber);
    pointerDot.hidden = !pointer || pointer.kind !== "laser" || !page;
    spotlightLayer.hidden = !pointer || pointer.kind !== "spotlight" || !page;
    if (!pointer || !page) return;

    const hostRect = host.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    if (pointer.kind === "laser") {
      pointerDot.style.left = `${pageRect.left - hostRect.left + pointer.x * pageRect.width}px`;
      pointerDot.style.top = `${pageRect.top - hostRect.top + pointer.y * pageRect.height}px`;
      return;
    }

    const radius = Math.min(pageRect.width, pageRect.height) * 0.1;
    spotlightLayer.style.left = `${pageRect.left - hostRect.left}px`;
    spotlightLayer.style.top = `${pageRect.top - hostRect.top}px`;
    spotlightLayer.style.width = `${pageRect.width}px`;
    spotlightLayer.style.height = `${pageRect.height}px`;
    spotlightLayer.style.background = `radial-gradient(circle ${radius}px at ${pointer.x * 100}% ${pointer.y * 100}%, transparent 70%, rgb(0 0 0 / 78%) 100%)`;
  };

  const pointFromEvent = (event: PointerEvent): SlidePoint | undefined => {
    const page = currentPageElement(props.page);
    if (!page) return;
    const rect = page.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
  };

  createEffect(() => positionPointer(props.pointer, props.page));

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
            positionPointer(
              untrack(() => props.pointer),
              pageNumber,
            );
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
                  displayedPage = pageNumber;
                  pendingView = undefined;
                  viewer.replaceChildren(nextView.div);
                  previousView?.destroy();
                  positionPointer(
                    untrack(() => props.pointer),
                    pageNumber,
                  );
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
        position: "relative",
        cursor: props.onPointerMove ? "crosshair" : undefined,
        "touch-action": props.onPointerMove ? "none" : "auto",
      }}
      onPointerMove={(event) => props.onPointerMove?.(pointFromEvent(event))}
      onPointerLeave={() => props.onPointerMove?.(undefined)}
      onPointerCancel={() => props.onPointerMove?.(undefined)}
    >
      <div
        ref={viewer}
        class="pdfViewer singlePageView removePageBorders"
        style={{ padding: "0" }}
      />
      <span
        ref={pointerDot}
        class="laser-pointer"
        data-laser-pointer
        aria-hidden="true"
        hidden
      />
      <div
        ref={spotlightLayer}
        class="spotlight-layer"
        data-spotlight
        aria-hidden="true"
        hidden
      />
      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
    </div>
  );
};
