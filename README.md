# logseq-obfuscate

Hide the content of Logseq pages until you unlock them, so opening one by mistake
(or while sharing your screen) doesn't reveal anything.

Requires the Logseq **DB version** (2.0+).

## Usage

- Tag a page with `#obfuscate`. Its content is blurred wherever it renders:
  the main view, the right sidebar, and blocks shown in references or embeds.
- On a tagged page, click the lock icon in the top bar to reveal it.
  Leaving the page locks it again.

Purely visual: nothing is encrypted and your data on disk is unchanged.
Search results are not hidden.

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
