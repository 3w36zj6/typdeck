import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Metadata } from "./types/metadata";
import { Icon } from "@iconify-icon/solid";

type MenuIconProps = {
  disabled?: boolean;
  icon: string;
};

const MenuIcon = (props: MenuIconProps) => {
  const [hovered, setHovered] = createSignal(false);
  return (
    <Icon
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      icon={props.icon}
      width="32"
      height="32"
      style={{
        color: props.disabled ? "#555" : hovered() ? "#fff" : "#aaa",
        transition: "color 0.3s",
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? "not-allowed" : "pointer",
      }}
    />
  );
};

const IconSeparator = () => (
  <div
    class="icon-separator"
    style={{
      "border-left": "1px solid #444",
      height: "32px",
    }}
  />
);

const App = () => {
  const [metadata] = createResource<Metadata>(async () => {
    const response = await fetch("./metadata.json");
    return response.json();
  });

  const getPageFromHash = () => {
    const hash = window.location.hash;
    if (hash.startsWith("#")) {
      const page = parseInt(hash.slice(1));
      if (!isNaN(page) && page > 0) {
        return page;
      }
    }
    return 1;
  };

  const [currentPage, setCurrentPage] = createSignal(getPageFromHash());
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const resetElapsedSeconds = () => {
    setElapsedSeconds(0);
  };
  const [isMenuVisible, setIsMenuVisible] = createSignal(true);
  let hideMenuTimeout: number;

  const urlParams = new URLSearchParams(window.location.search);
  const isPresenterMode = urlParams.get("mode") === "presenter";

  const slideChannel = new BroadcastChannel("slide-sync");
  slideChannel.onmessage = (e) => {
    if (e.data.currentPage && e.data.currentPage !== currentPage()) {
      setCurrentPage(e.data.currentPage);
    }
  };

  createEffect(() => {
    slideChannel.postMessage({ currentPage: currentPage() });
  });

  const showMenu = () => {
    setIsMenuVisible(true);
    window.clearTimeout(hideMenuTimeout);
    hideMenuTimeout = window.setTimeout(() => {
      setIsMenuVisible(false);
    }, 3000);
  };

  const toggleFullScreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const [isTransitioning, setIsTransitioning] = createSignal(false);
  const TRANSITION_DURATION_MS = 150;

  const goPreviousPage = () => {
    if (isTransitioning()) return;
    setIsTransitioning(true);
    setCurrentPage((prev) => Math.max(prev - 1, 1));
    window.setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION_MS);
  };

  const goNextPage = () => {
    if (isTransitioning()) return;
    if (!metadata()) return;
    setIsTransitioning(true);
    const max = metadata()!.pageCount;
    setCurrentPage((prev) => Math.min(prev + 1, max));
    window.setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION_MS);
  };

  let lastKeyTriggerUnixTimeMs = 0;
  const KEY_THROTTLE_DELAY_MS = 150;

  const handleKeyDown = (e: KeyboardEvent) => {
    const now = Date.now();
    if (now - lastKeyTriggerUnixTimeMs < KEY_THROTTLE_DELAY_MS) {
      return;
    }
    lastKeyTriggerUnixTimeMs = now;
    if (!metadata()) return;
    switch (e.code) {
      case "ArrowLeft":
      case "ArrowUp":
        goPreviousPage();
        break;
      case "ArrowRight":
      case "ArrowDown":
        goNextPage();
        break;
    }
  };

  createEffect(() => {
    if (metadata()) {
      const page = getPageFromHash();
      setCurrentPage(Math.min(page, metadata()!.pageCount));
    }
  });

  createEffect(() => {
    const page = currentPage();
    if (page !== getPageFromHash()) {
      window.location.hash = `#${page}`;
    }
  });

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", showMenu);
    window.addEventListener("touchstart", showMenu);

    if (isPresenterMode) {
      const intervalId = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      onCleanup(() => {
        window.clearInterval(intervalId);
      });
    }

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", showMenu);
      window.removeEventListener("touchstart", showMenu);
      window.clearTimeout(hideMenuTimeout);
      slideChannel.close();
    });
  });

  const openPresenterWindow = () => {
    window.open(
      `./?mode=presenter`,
      "presenter",
      "width=1024,height=768,noopener,noreferrer",
    );
  };

  return (
    <>
      <Show
        when={isPresenterMode}
        fallback={
          <>
            <div
              class="slide-container"
              style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                position: "relative",
                background: "black",
              }}
            >
              {metadata() && (
                <div
                  class="slide"
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                  }}
                >
                  <For
                    each={Array.from(
                      { length: metadata()!.pageCount },
                      (_, i) => i + 1,
                    )}
                  >
                    {(pageNumber) => (
                      <img
                        src={`./pages/${pageNumber}.svg`}
                        style={{
                          width: "100%",
                          height: "100%",
                          "object-fit": "contain",
                          position: "absolute",
                          top: "0",
                          left: "0",
                          display:
                            currentPage() === pageNumber ? "block" : "none",
                          "pointer-events": "none",
                          "user-select": "none",
                          "-webkit-user-drag": "none",
                        }}
                      />
                    )}
                  </For>
                </div>
              )}
            </div>
            <div
              class="menu"
              style={{
                position: "fixed",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 0, 0, 0.5)",
                padding: "10px",
                "border-radius": "5px",
                display: "flex",
                "flex-direction": "column",
                gap: "5px",
                opacity: isMenuVisible() ? "1" : "0",
                transition: "opacity 0.3s",
                "pointer-events": isMenuVisible() ? "auto" : "none",
              }}
            >
              <div
                class="menu-row"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "32px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                }}
              >
                <button
                  onClick={goPreviousPage}
                  style={{ position: "absolute", left: "0", height: "100%" }}
                >
                  <MenuIcon
                    icon="lucide:chevron-left"
                    disabled={currentPage() === 1}
                  />
                </button>
                <span
                  style={{
                    color: "#fff",
                    "min-width": "200px",
                    "text-align": "center",
                  }}
                >
                  Page {currentPage()}{" "}
                  {metadata() ? `of ${metadata()!.pageCount}` : ""}
                </span>
                <button
                  onClick={goNextPage}
                  style={{ position: "absolute", right: "0", height: "100%" }}
                >
                  <MenuIcon
                    icon="lucide:chevron-right"
                    disabled={currentPage() === metadata()?.pageCount}
                  />
                </button>
              </div>
              <div
                class="menu-row"
                style={{
                  position: "relative",
                  width: "100%",
                  height: "32px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "10px",
                }}
              >
                <button onClick={toggleFullScreen} style={{ height: "100%" }}>
                  <MenuIcon icon="lucide:fullscreen" />
                </button>
                <button
                  onClick={() => {
                    openPresenterWindow();
                  }}
                  style={{ height: "100%" }}
                >
                  <MenuIcon icon="lucide:presentation" />
                </button>
              </div>
            </div>
          </>
        }
      >
        <div
          class="presenter-container"
          style={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            "flex-direction": "column",
            background: "black",
            color: "#fff",
            overflow: "hidden",
            margin: "0",
            padding: "0",
          }}
        >
          <div
            class="slides"
            style={{
              flex: "1 1 auto",
              "min-height": "0",
              display: "flex",
              "justify-content": "space-between",
              overflow: "hidden",
            }}
          >
            {metadata() && (
              <>
                <div
                  class="current-slide"
                  style={{
                    width: "49%",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    overflow: "hidden",
                  }}
                >
                  <For
                    each={Array.from(
                      { length: metadata()!.pageCount },
                      (_, i) => i + 1,
                    )}
                  >
                    {(pageNumber) => (
                      <img
                        src={`./pages/${pageNumber}.svg`}
                        style={{
                          width: "100%",
                          height: "100%",
                          "max-height": "100%",
                          "object-fit": "contain",
                          display:
                            pageNumber === currentPage() ? "block" : "none",
                          "pointer-events": "none",
                          "user-select": "none",
                          "-webkit-user-drag": "none",
                        }}
                      />
                    )}
                  </For>
                </div>
                <div
                  class="next-slide"
                  style={{
                    width: "49%",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    overflow: "hidden",
                  }}
                >
                  <For
                    each={Array.from(
                      { length: metadata()!.pageCount },
                      (_, i) => i + 1,
                    )}
                  >
                    {(pageNumber) => (
                      <img
                        src={`./pages/${pageNumber}.svg`}
                        style={{
                          width: "100%",
                          height: "100%",
                          "max-height": "100%",
                          "object-fit": "contain",
                          display:
                            pageNumber ===
                            (currentPage() < metadata()!.pageCount
                              ? currentPage() + 1
                              : currentPage())
                              ? "block"
                              : "none",
                          opacity: "0.5",
                          "pointer-events": "none",
                          "user-select": "none",
                          "-webkit-user-drag": "none",
                        }}
                      />
                    )}
                  </For>
                </div>
              </>
            )}
          </div>
          <div
            class="speaker-notes"
            style={{
              padding: "10px",
              "border-top": "1px solid #333",
              "background-color": "#111",
              height: "200px",
              "overflow-y": "auto",
              "flex-shrink": "0",
            }}
          >
            {metadata()?.slides?.[`${currentPage()}`]?.speakerNotes ? (
              <p
                style={{
                  margin: "0",
                  "white-space": "pre-wrap",
                  "word-break": "break-word",
                }}
              >
                {metadata()!.slides?.[`${currentPage()}`]?.speakerNotes}
              </p>
            ) : (
              <p style={{ margin: "0", color: "#666", "font-style": "italic" }}>
                No speaker notes for this slide.
              </p>
            )}
          </div>
          <div
            class="presenter-footer"
            style={{
              display: "flex",
              "justify-content": "space-between",
              "align-items": "center",
              padding: "10px",
              "background-color": "#222",
              height: "32px",
              "flex-shrink": "0",
            }}
          >
            <div
              style={{
                height: "32px",
                display: "flex",
                gap: "10px",
                "align-items": "center",
              }}
            >
              <Icon
                icon="lucide:clock"
                width="32"
                height="32"
                style={{
                  color: "#fff",
                }}
              />

              <div
                style={{
                  "font-size": "32px",
                }}
              >
                {formatTime(elapsedSeconds())}
              </div>
              <IconSeparator />
              <button onClick={resetElapsedSeconds} style={{ height: "32px" }}>
                <MenuIcon icon="lucide:timer-reset" />
              </button>
            </div>
            <div
              style={{ display: "flex", gap: "10px", "align-items": "center" }}
            >
              <button onClick={goPreviousPage} style={{ height: "32px" }}>
                <MenuIcon
                  icon="lucide:chevron-left"
                  disabled={currentPage() === 1}
                />
              </button>
              <span
                style={{
                  color: "#fff",
                  "font-size": "16px",
                  "min-width": "120px",
                  "text-align": "center",
                }}
              >
                Page {currentPage()} of {metadata() ? metadata()!.pageCount : 0}
              </span>
              <button onClick={goNextPage} style={{ height: "32px" }}>
                <MenuIcon
                  icon="lucide:chevron-right"
                  disabled={
                    currentPage() === metadata()?.pageCount || !metadata()
                  }
                />
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
};

export default App;
