import { createSignal, onCleanup, onMount } from "solid-js";
import "./App.css";
import { Metadata } from "./types/metadata";

function App() {
  const [metadata, setMetadata] = createSignal<Metadata | null>(null);
  const [currentPage, setCurrentPage] = createSignal(1);

  onMount(() => {
    fetch("./metadata.json")
      .then((response) => response.json() as Promise<Metadata>)
      .then((metadata) => {
        setMetadata(metadata);
        setCurrentPage(1);
      })
      .catch((error) => console.error(error));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!metadata()) return;
      const max = metadata()?.pageCount ?? 1;

      switch (e.code) {
        case "ArrowLeft":
        case "ArrowUp":
          setCurrentPage((prev) => Math.max(prev - 1, 1));
          break;
        case "ArrowRight":
        case "ArrowDown":
          setCurrentPage((prev) => Math.min(prev + 1, max));
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <>
      <div class="slide-container">
        {metadata() && (
          <div class="slide">
            <img src={`./pages/${currentPage()}.svg`} alt="" />
          </div>
        )}
      </div>
    </>
  );
}

export default App;
