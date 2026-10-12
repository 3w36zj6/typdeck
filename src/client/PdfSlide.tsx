import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFPageView,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import {
  drawingLayers,
  slideRectFromPoints,
  type DrawingStroke,
  type SlideRect,
  type SlidePoint,
  type SlidePointer,
  type SlideZoom,
} from "./drawing";

type PdfSlideProps = {
  document: PDFDocumentProxy;
  page: number;
  label: string;
  opacity?: number;
  pointer?: SlidePointer;
  zoom?: SlideZoom;
  drawings?: DrawingStroke[];
  onNavigate?: (page: number) => void;
  onPointerMove?: (point: SlidePoint | undefined) => void;
  onDrawStart?: (point: SlidePoint) => void;
  onDrawMove?: (points: SlidePoint[]) => void;
  onDrawEnd?: (commit: boolean) => void;
  onSelectZoom?: (rect: SlideRect) => void;
};

const PDF_TO_CSS_UNITS = 96 / 72;
// ponytail: Keep PDF canvases bounded; tiled rendering is required before deeper zoom.
const MAX_ZOOM = 4;

export const PdfSlide = (props: PdfSlideProps) => {
  const drawingMask = createUniqueId();
  let host!: HTMLDivElement;
  let viewer!: HTMLDivElement;
  let pointerDot!: HTMLSpanElement;
  let spotlightLayer!: HTMLDivElement;
  let drawingLayer!: SVGSVGElement;
  let selectionLayer!: HTMLDivElement;
  let displayedView: PDFPageView | undefined;
  let displayedPage: number | undefined;
  let requestedPage = 0;
  let requestRender = () => {};
  const [error, setError] = createSignal<string>();
  const [selectionStart, setSelectionStart] = createSignal<SlidePoint>();
  const [selection, setSelection] = createSignal<SlideRect>();

  const positionPageOverlay = (element: HTMLElement | SVGSVGElement) => {
    const page =
      displayedPage === requestedPage ? displayedView?.div : undefined;
    if (!page) return false;
    const hostRect = host.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    element.style.left = `${pageRect.left - hostRect.left}px`;
    element.style.top = `${pageRect.top - hostRect.top}px`;
    element.style.width = `${pageRect.width}px`;
    element.style.height = `${pageRect.height}px`;
    return true;
  };

  const positionPointer = (pointer: SlidePointer | undefined) => {
    const page =
      displayedPage === requestedPage ? displayedView?.div : undefined;
    pointerDot.hidden = !pointer || pointer.kind !== "laser" || !page;
    spotlightLayer.hidden =
      !pointer ||
      pointer.kind !== "spotlight" ||
      !positionPageOverlay(spotlightLayer);
    if (!pointer || !page) return;

    const hostRect = host.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    if (pointer.kind === "laser") {
      pointerDot.style.width = `${16 * pointer.size}px`;
      pointerDot.style.height = `${16 * pointer.size}px`;
      pointerDot.style.left = `${pageRect.left - hostRect.left + pointer.x * pageRect.width}px`;
      pointerDot.style.top = `${pageRect.top - hostRect.top + pointer.y * pageRect.height}px`;
      return;
    }

    const radius =
      Math.min(pageRect.width, pageRect.height) * 0.1 * pointer.size;
    spotlightLayer.style.background = `radial-gradient(circle ${radius}px at ${pointer.x * 100}% ${pointer.y * 100}%, transparent 70%, rgb(0 0 0 / 78%) 100%)`;
  };

  const positionDrawingLayer = () => {
    drawingLayer.style.display = positionPageOverlay(drawingLayer)
      ? ""
      : "none";
  };

  const positionSelectionLayer = (rect: SlideRect | undefined) => {
    selectionLayer.style.display =
      rect && positionPageOverlay(selectionLayer) ? "" : "none";
  };

  const pointFromEvent = (event: PointerEvent): SlidePoint | undefined => {
    const page =
      displayedPage === requestedPage ? displayedView?.div : undefined;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
  };

  const handlePointerMove = (event: PointerEvent) => {
    const point = pointFromEvent(event);
    const start = selectionStart();
    if (start && host.hasPointerCapture(event.pointerId)) {
      event.preventDefault();
      if (point) setSelection(slideRectFromPoints(start, point));
      return;
    }
    if (props.onDrawMove && host.hasPointerCapture(event.pointerId)) {
      event.preventDefault();
      const events = event.getCoalescedEvents?.() ?? [];
      const points = (events.length ? events : [event]).flatMap((event) => {
        const point = pointFromEvent(event);
        return point ? [point] : [];
      });
      if (points.length) props.onDrawMove(points);
      return;
    }
    props.onPointerMove?.(point);
  };

  const handlePointerDown = (event: PointerEvent) => {
    const point = pointFromEvent(event);
    if (!event.isPrimary || event.button !== 0 || !point) return;
    if (props.onSelectZoom) {
      event.preventDefault();
      host.setPointerCapture(event.pointerId);
      setSelectionStart(point);
      setSelection({ ...point, width: 0, height: 0 });
      return;
    }
    if (!props.onDrawStart) return;
    event.preventDefault();
    host.setPointerCapture(event.pointerId);
    props.onDrawStart(point);
  };

  const handlePointerEnd = (event: PointerEvent, commit = true) => {
    if (!host.hasPointerCapture(event.pointerId)) return;
    host.releasePointerCapture(event.pointerId);
    const rect = selection();
    if (selectionStart()) {
      setSelectionStart(undefined);
      setSelection(undefined);
      if (commit && rect && rect.width >= 0.05 && rect.height >= 0.05) {
        props.onSelectZoom?.(rect);
      }
    } else {
      props.onDrawEnd?.(commit);
    }
  };

  createEffect(() => {
    requestedPage = props.page;
    viewer.inert = displayedPage !== requestedPage;
    positionPointer(props.pointer);
    positionDrawingLayer();
    positionSelectionLayer(selection());
  });

  createEffect(
    on(
      () => props.zoom,
      () => requestRender(),
    ),
  );

  createEffect(
    on(
      () => props.page,
      () => {
        setSelectionStart(undefined);
        setSelection(undefined);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    if (props.onSelectZoom) return;
    setSelectionStart(undefined);
    setSelection(undefined);
  });

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
            positionPointer(untrack(() => props.pointer));
            positionDrawingLayer();
            positionSelectionLayer(untrack(selection));
            const fitScale = Math.min(
              host.clientWidth / baseViewport.width / PDF_TO_CSS_UNITS,
              host.clientHeight / baseViewport.height / PDF_TO_CSS_UNITS,
            );
            const zoom = untrack(() => props.zoom);
            const scale = zoom
              ? Math.min(
                  fitScale * MAX_ZOOM,
                  host.clientWidth /
                    baseViewport.width /
                    zoom.width /
                    PDF_TO_CSS_UNITS,
                  host.clientHeight /
                    baseViewport.height /
                    zoom.height /
                    PDF_TO_CSS_UNITS,
                )
              : fitScale;
            viewer.style.transform = zoom
              ? `translate(${(0.5 - zoom.x - zoom.width / 2) * baseViewport.width * scale * PDF_TO_CSS_UNITS}px, ${(0.5 - zoom.y - zoom.height / 2) * baseViewport.height * scale * PDF_TO_CSS_UNITS}px)`
              : "";
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
                  viewer.inert = false;
                  pendingView = undefined;
                  viewer.replaceChildren(nextView.div);
                  previousView?.destroy();
                  positionPointer(untrack(() => props.pointer));
                  positionDrawingLayer();
                  positionSelectionLayer(untrack(selection));
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
        requestRender = render;
        render();
      })
      .catch(() => {
        if (!disposed) setError("Could not load this slide.");
      });

    onCleanup(() => {
      disposed = true;
      observer?.disconnect();
      requestRender = () => {};
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
        cursor:
          props.onPointerMove || props.onDrawStart || props.onSelectZoom
            ? "crosshair"
            : undefined,
        "touch-action":
          props.onDrawStart || props.onSelectZoom ? "none" : "auto",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerLeave={(event) => {
        if (!host.hasPointerCapture(event.pointerId)) {
          props.onPointerMove?.(undefined);
        }
      }}
      onPointerCancel={(event) => {
        handlePointerEnd(event, false);
        props.onPointerMove?.(undefined);
      }}
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
      <div
        ref={selectionLayer}
        class="zoom-selection-layer"
        aria-hidden="true"
        style={{ display: "none" }}
      >
        <Show when={selection()}>
          {(rect) => (
            <div
              style={{
                left: `${rect().x * 100}%`,
                top: `${rect().y * 100}%`,
                width: `${rect().width * 100}%`,
                height: `${rect().height * 100}%`,
              }}
            />
          )}
        </Show>
      </div>
      <svg
        ref={drawingLayer}
        class="drawing-layer"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ display: "none" }}
      >
        <For each={drawingLayers(props.drawings ?? [])}>
          {({ index, stroke, erasers }) => {
            const mask = `${drawingMask}-${index}`;
            return (
              <>
                <defs>
                  <mask
                    id={mask}
                    x="0"
                    y="0"
                    width="1"
                    height="1"
                    maskUnits="userSpaceOnUse"
                  >
                    <rect width="1" height="1" fill="white" />
                    <For each={erasers}>
                      {(eraser) => (
                        <polyline
                          points={eraser.points
                            .map(({ x, y }) => `${x},${y}`)
                            .join(" ")}
                          fill="none"
                          stroke="black"
                          stroke-width={24 * eraser.size}
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          vector-effect="non-scaling-stroke"
                        />
                      )}
                    </For>
                  </mask>
                </defs>
                <g mask={`url(#${mask})`}>
                  <polyline
                    points={stroke.points
                      .map(({ x, y }) => `${x},${y}`)
                      .join(" ")}
                    fill="none"
                    stroke={stroke.color}
                    stroke-width={4 * stroke.size}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                  />
                </g>
              </>
            );
          }}
        </For>
      </svg>
      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
    </div>
  );
};
