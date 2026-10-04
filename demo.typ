#import "@preview/touying:0.6.1": *
#import themes.university: *

#import "@preview/numbly:0.1.0": numbly

#show: university-theme.with(
  aspect-ratio: "16-9",
  config-info(
    title: [typdeck],
    subtitle: [A demo of typdeck],
    author: [3w36zj6],
    date: datetime.today(),
  ),
)

#set heading(numbering: numbly("{1}.", default: "1.1"))
#show raw: set text(size: 0.8em)

#title-slide()

== Outline <touying:hidden>

#components.adaptive-columns(outline(title: none, indent: 1em))

= Introduction

== What is typdeck?

#speaker-note[Introduce typdeck.]

- typdeck compiles Typst slides into a web stage and presenter view

== Features

#speaker-note[Explain the key features.]

- 📝 *Typst based*
  - create beautiful slides using Typst, with full access to its powerful typesetting capabilities and growing ecosystem of packages #pause
- 🔓 *Theme independent*
  - works with any Typst theme, not just Polylux, Slydst, Touying, etc. #pause
- ⚡️ *Hot reload*
  - automatically reloads the browser when you save a Typst file #pause
- 📢 *Presenter mode*
  - access speaker notes and presentation controls in a dedicated presenter view

= Getting started

== Installation

#speaker-note[Remind the audience that Typst is required.]

First, make sure you have Typst installed on your system. Then install typdeck using your preferred package manager:

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

== Usage

Create a Typst file for your slides (e.g. `main.typ`) and use typdeck to build and preview them:

=== Development Mode

Run a development server with hot-reload to see changes in real-time:

```sh
typdeck dev main.typ
```

This will start a local development server and automatically refresh the browser whenever you make changes to your Typst file.

#pagebreak()

=== Building for Production

Build your slides for production deployment:

```sh
typdeck build main.typ
```

This command compiles your Typst slides and generates static assets in the output directory.

=== Preview Build

Serve the build output without recompiling or watching source files:

```sh
typdeck preview
```
