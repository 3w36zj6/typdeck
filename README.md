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
- 📢 **Presenter mode** - access speaker notes and presentation controls in a dedicated presenter view

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

## Features

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

### Speaker notes

`Note` stores speaker notes for the page containing the marker.

```typst
#metadata((t: "Note", v: "Explain this result.")) <pdfpc>
```

`v` is the note text as a Typst `str`.

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
