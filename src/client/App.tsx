import { createEffect, createSignal, For, onCleanup, onMount } from "solid-js";
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

const App = () => {
  const [metadata, setMetadata] = createSignal<Metadata | null>(null);

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
  // @ts-expect-error - Unused variable
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isFullScreen, setIsFullScreen] = createSignal(false);
  const [presenterMode, setPresenterMode] = createSignal(false);
  const [isMenuVisible, setIsMenuVisible] = createSignal(true);
  let hideMenuTimeout: number;

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
      setIsFullScreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  const goPreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goNextPage = () => {
    if (!metadata()) return;
    const max = metadata()!.pageCount;
    setCurrentPage((prev) => Math.min(prev + 1, max));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
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
    fetch("./metadata.json")
      .then((response) => response.json() as Promise<Metadata>)
      .then((metadata) => {
        setMetadata(metadata);
      })
      .catch((error) => console.error(error));

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", showMenu);
    window.addEventListener("touchstart", showMenu);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", showMenu);
      window.removeEventListener("touchstart", showMenu);
      window.clearTimeout(hideMenuTimeout);
    });
  });

  return (
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
            style={{ width: "100%", height: "100%", position: "relative" }}
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
                    display: currentPage() === pageNumber ? "block" : "none",
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
            onClick={() => setPresenterMode(!presenterMode())}
            style={{ height: "100%" }}
          >
            <MenuIcon icon="lucide:presentation" />
          </button>
        </div>
      </div>
    </>
  );
};

export default App;
