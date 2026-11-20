# logseq-obfuscate

Hide the content of Logseq pages until you unlock them, so opening one by mistake
(or while sharing your screen) doesn't reveal anything.

Requires the Logseq **DB version** (2.0+).

## Usage

- Tag a page with `#obfuscate`. Its content and title are blurred wherever
  they render: the page itself, links to it, references and embeds of its
  blocks, page lists and tables, the sidebars and the window title.
- Tag a single block with `#obfuscate` to hide just that block and its children.
- Titles stay clickable, so you can still navigate to a hidden page.
- When the page you're on shows anything hidden, click the lock icon in the
  top bar to reveal the main view. Leaving the page locks it again.

Purely visual: nothing is encrypted and your data on disk is unchanged.
Search results and table tooltips are not hidden.

## Try it

`demo-graph/` is a small Markdown graph with tagged pages and pages that link,
reference and embed them. Import it into a new DB graph to try the plugin.

## Install

1. Download `logseq-obfuscate.zip` from the latest
   [release](https://github.com/LudeeD/logseq-obfuscate/releases) and unzip it.
2. In Logseq: **Settings → Advanced → Developer mode** on.
3. **Plugins → Load unpacked plugin** and pick the unzipped folder.

## Development

```sh
npm install
npm run build
```

Then load this folder as an unpacked plugin. Rebuild and reload the plugin after changes.
