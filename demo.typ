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

- typdeck is a static site generator for slides with Typst

== Features

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

=== Preview Production Build

Preview the production build locally:

```sh
typdeck preview
```

This runs a local server to preview the production build before deployment.

== Configuration

#text(
  [
    Typdeck uses a configuration file to customize the build process. The following file formats are supported:

    - `typdeck.json`
    - `typdeck.json5`
    - `typdeck.jsonc`
    - `typdeck.toml`
    - `typdeck.yaml`
    - `typdeck.yml`

    Place the configuration file in the root directory of your Typst project (recommended), and typdeck will automatically detect and use it. Typdeck searches for configuration files in the current working directory where you run the command.
  ],
  size: 0.9em,
)

#pagebreak()

Here's an example configuration in JSON format:

```json
{
  "$schema": "https://3w36zj6.github.io/typdeck/schema/0.1.0/schema.json",
  "slides": {
    "1": {
      "speakerNotes": "Introduction slide. Start with a greeting."
    },
    "3": {
      "speakerNotes": "This slide explains the key concepts."
    },
    "5": {
      "speakerNotes": "Remember to demo the application here."
    }
  }
}
```
