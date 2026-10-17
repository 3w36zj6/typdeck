# typdeck

[![NPM Version](https://img.shields.io/npm/v/typdeck)](https://www.npmjs.com/package/typdeck?activeTab=versions)
[![NPM Downloads](https://img.shields.io/npm/d18m/typdeck)](https://www.npmjs.com/package/typdeck)
[![NPM License](https://img.shields.io/npm/l/typdeck)](https://github.com/3w36zj6/typdeck/blob/HEAD/LICENSE)
[![CI](https://github.com/3w36zj6/typdeck/actions/workflows/ci.yaml/badge.svg?branch=main&event=push)](https://github.com/3w36zj6/typdeck/actions/workflows/ci.yaml)

Compile Typst slides into a web stage and presenter view.

## Highlights

[Typst]: https://typst.app/
[Polylux]: https://typst.app/universe/package/polylux/
[Slydst]: https://typst.app/universe/package/slydst/
[Touying]: https://typst.app/universe/package/touying/

- 📝 **Typst based** - create beautiful slides using [Typst], with full access to its powerful typesetting capabilities and growing ecosystem of packages
- 🔓 **Theme independent** - works with any Typst theme, not just [Polylux], [Slydst], [Touying], etc.
- ⚡️ **Hot reload** - automatically reloads the browser when you save a Typst file
- 📢 **Presenter View** - access speaker notes and presentation controls in a dedicated presenter view

## Getting Started

### Installation

First, make sure you have [Typst] 0.15.0 or newer installed on your system. Then install typdeck using your preferred package manager:

```sh
# npm
npm install -D typdeck

# Yarn
yarn add -D typdeck

# pnpm
pnpm add -D typdeck

# Bun
bun add -d typdeck
```

### Usage

Create a Typst file for your slides (e.g. `main.typ`) and use typdeck to build and preview them:

#### Development Mode

Run a development server with hot-reload to see changes in real-time:

```sh
typdeck dev main.typ
```

This will start a local development server and automatically refresh the browser whenever you make changes to your Typst file.

#### Building for Production

Build your slides for production deployment:

```sh
typdeck build main.typ
```

This command compiles your Typst slides and generates static assets in the output directory.

#### Preview Build

Serve the build output without recompiling or watching source files:

```sh
typdeck preview
```

#### Shell Completion

Generate completion for Bash (`bash`), Zsh (`zsh`), Fish (`fish`), PowerShell (`pwsh`), or Nushell (`nu`):

```sh
typdeck completion zsh > ~/.zfunc/_typdeck
```

## Features

### Pointer tools

Presenter View provides a laser pointer and spotlight that follow pointer input on the current slide and appear on the Stage.

### Zoom

Presenter View can select a region to enlarge on both displays while preserving the PDF text, links, and document structure.

### Drawing

Presenter View synchronizes temporary pen and eraser strokes with the Stage. Drawings are shared across overlay steps and are never written to the source.

### Blank screens

Blackout and whiteout temporarily cover the Stage. Press `B` or `W` to toggle them.

### Freeze

Freeze keeps the current slide on the Stage while Presenter View moves ahead. Use its button or press `Shift+F` in Presenter View.

### Hidden slides

`HiddenSlide` marks a page to be skipped during normal navigation while keeping
it directly accessible.

```typst
#metadata((t: "HiddenSlide")) <pdfpc>
```

### End slide

`EndSlide` marks the slide opened by the `End` key. Without this marker, `End` opens the final visible slide.

Slides after `EndSlide` remain accessible as appendices and are excluded from presentation progress.

```typst
#metadata((t: "EndSlide")) <pdfpc>
```

### Saved slide

`SaveSlide` marks the slide opened by `Shift+M`.

```typst
#metadata((t: "SaveSlide")) <pdfpc>
```

### Presentation timer

`Duration` sets the planned presentation length in minutes. With a duration, `LastMinutes` sets when Presenter View starts showing its ending warning.

```typst
#metadata((t: "Duration", v: 30)) <pdfpc>
#metadata((t: "LastMinutes", v: 5)) <pdfpc>
```

Presenter View starts timing manually or on first navigation, tracks pace with a positive `Duration`, and can advance slides automatically at a chosen interval.

### Start time

`StartTime` sets the local start time in 24-hour `HH:MM` format.

```typst
#metadata((t: "StartTime", v: "14:10")) <pdfpc>
```

Presenter View counts down to `StartTime` and starts automatically. A manual start or slide navigation starts it early.

### End time

`EndTime` sets the local end time in 24-hour `HH:MM` format.

```typst
#metadata((t: "EndTime", v: "14:40")) <pdfpc>
```

Together, `StartTime` and `EndTime` define the duration. With `EndTime` and `Duration`, typdeck derives the missing `StartTime`.

### Speaker notes

`Note` stores speaker notes for the page containing the marker.

```typst
#metadata((t: "Note", v: "Explain this result.")) <pdfpc>
```

`v` is the note text as a Typst `str`.

Presenter View renders notes as Markdown and sanitizes the generated HTML. Add `DisableMarkdown` to preserve plain text.

```typst
#metadata((t: "DisableMarkdown", v: true)) <pdfpc>
```

### Logical slides

`LogicalSlide` identifies the pages that form one slide.

```typst
#metadata((t: "LogicalSlide", v: 1)) <pdfpc>
#metadata((t: "Overlay", v: 0)) <pdfpc>
```

`v` is a non-negative integer shared by every page in the group. Each grouped
page must also have an `Overlay` marker.

### Overlays

`Overlay` orders pages within a logical slide.

```typst
#metadata((t: "LogicalSlide", v: 1)) <pdfpc>
#metadata((t: "Overlay", v: 1)) <pdfpc>
```

`v` is the zero-based step number. typdeck reveals each step while counting the
group as one slide and previews the final step in Presenter View.
