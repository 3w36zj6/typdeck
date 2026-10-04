import type { Metadata } from "./types/metadata";

export const actionForKey = ({
  code,
  shiftKey,
  repeat,
  isComposing,
}: Pick<KeyboardEvent, "code" | "shiftKey" | "repeat" | "isComposing">) => {
  if (repeat || isComposing) return;
  switch (code) {
    case "ArrowLeft":
    case "ArrowUp":
      return "previous";
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "KeyB":
      return "blackout";
    case "Slash":
      return shiftKey ? "shortcuts" : undefined;
  }
};

export const formatElapsedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
};

export const pageLabel = (metadata: Metadata, page: number): string => {
  const title = metadata.outline?.find(
    (heading) => heading.page === page,
  )?.text;
  return title ? `${page}. ${title}` : `Page ${page}`;
};
