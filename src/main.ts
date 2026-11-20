import "@logseq/libs";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";

const TAG = "obfuscate";
const STYLE_KEY = "obfuscate-style";
const TOOLBAR_KEY = "obfuscate-toggle";
const BLUR = "blur(12px)";
// Set on elements that only show a page name (Recent, Favorites, sidebar).
const MARK = "data-obfuscate";

// Logseq renders every page with `data-page-tags='["Page", "obfuscate"]'`,
// in the main view and in the sidebar alike.
const TAGGED_PAGE = `.page[data-page-tags*='"${TAG}"']`;
const MAIN = "#main-content-container";
// Excludes anything inside the main view, used once the user unlocks it.
const OUTSIDE_MAIN = `:not(${MAIN} *)`;

// The plugin runs in an iframe on the same origin as Logseq's window.
const hostDocument = parent.document;

// Does the main view show anything hidden, and has the user unlocked it?
// Unlocking resets on every navigation, so leaving a page locks it again.
let mainHasHidden = false;
let unlocked = false;
// Uuids of every block on a tagged page, so they stay hidden when they show
// up elsewhere (linked references, embeds, block references).
let hiddenBlocks: string[] = [];
// Uuids of tagged pages, so their titles are blurred wherever they are linked.
let hiddenPages: string[] = [];
// Lowercased titles of tagged pages, for lists that carry no uuid.
let hiddenTitles = new Set<string>();

function selectors(scope: string) {
  return {
    // Content: blurred and not interactive.
    content: [
      `${TAGGED_PAGE} .ls-page-blocks${scope}`,
      ...hiddenBlocks.map((uuid) => `.ls-block[blockid="${uuid}"]${scope}`),
    ],
    // Links: blurred but still clickable. Page links (also used for rows in
    // lists and tables) and block references both carry the target's uuid.
    links: [
      `${TAGGED_PAGE} .ls-page-title${scope}`,
      ...[...hiddenPages, ...hiddenBlocks].map(
        (uuid) => `a.page-ref[data-uuid="${uuid}"]${scope}`,
      ),
      // A page embed shows the page's title as a block with the page's uuid.
      ...hiddenPages.map((uuid) => `.block-content[blockid="${uuid}"]${scope}`),
      // Tag page tables show the title inside the page's row.
      ...hiddenPages.map((uuid) => `[blockid="${uuid}"] .table-block-title${scope}`),
      // Table cells (All pages) link by href instead.
      ...hiddenPages.map((uuid) => `a.page-ref[href="#/page/${uuid}"]${scope}`),
      `[${MARK}]`,
    ],
  };
}

function renderStyle() {
  const { content, links } = selectors(unlocked ? OUTSIDE_MAIN : "");
  logseq.provideStyle({
    key: STYLE_KEY,
    style: `
      ${content.join(",\n")} {
        filter: ${BLUR};
        pointer-events: none;
        user-select: none;
      }
      ${links.join(",\n")} {
        filter: ${BLUR};
        user-select: none;
      }
    `,
  });
}

function renderButton() {
  logseq.App.registerUIItem("toolbar", {
    key: TOOLBAR_KEY,
    template: mainHasHidden
      ? `<a class="button" data-on-click="toggle" title="${unlocked ? "Lock page" : "Unlock page"}">
           <i class="ti ${unlocked ? "ti-lock-open" : "ti-lock"}"></i>
         </a>`
      : "<span></span>",
  });
}

// Recent, Favorites and right sidebar headers only show the page name, so
// match them by title.
function markTitles() {
  for (const el of hostDocument.querySelectorAll(
    "li .page-title, .sidebar-item-header .page-title",
  )) {
    const hidden = hiddenTitles.has(el.textContent?.trim().toLowerCase() ?? "");
    if (hidden !== el.hasAttribute(MARK)) el.toggleAttribute(MARK, hidden);
  }
}

// Show the button whenever the main view contains hidden content: a tagged
// page, or any other page that embeds or references hidden blocks.
function checkMain() {
  const { content, links } = selectors("");
  const main = hostDocument.querySelector(MAIN);
  const found = !!main?.querySelector([...content, ...links].join(","));
  if (found === mainHasHidden) return;
  mainHasHidden = found;
  renderButton();
}

function flatten(blocks: BlockEntity[]): string[] {
  return blocks.flatMap((block) => [
    block.uuid,
    ...flatten((block.children ?? []) as BlockEntity[]),
  ]);
}

// User tags have idents with a random suffix, so look them up by name.
async function collectHidden() {
  const tags = (await logseq.Editor.getTagsByName(TAG)) ?? [];
  const blocks: string[] = [];
  const pages: string[] = [];
  const titles = new Set<string>();
  for (const tag of tags) {
    const objects = (await logseq.Editor.getTagObjects(tag.uuid)) ?? [];
    for (const object of objects) {
      if (object.page) {
        // A tagged block: hide it and everything under it.
        const block = await logseq.Editor.getBlock(object.uuid, {
          includeChildren: true,
        });
        if (block) blocks.push(...flatten([block]));
      } else {
        // A tagged page: hide its blocks, and its title wherever it shows.
        // The page itself is not hidden as a block, since pages also render
        // as blocks in lists and tables.
        pages.push(object.uuid);
        if (object.title) titles.add(String(object.title).toLowerCase());
        const tree = await logseq.Editor.getPageBlocksTree(object.uuid);
        if (tree) blocks.push(...flatten(tree));
      }
    }
  }
  return { blocks, pages, titles };
}

// Guards against a slow refresh overwriting a newer one.
let refreshVersion = 0;

async function refresh() {
  const version = ++refreshVersion;
  const hidden = await collectHidden();
  if (version !== refreshVersion) return;
  hiddenBlocks = hidden.blocks;
  hiddenPages = hidden.pages;
  hiddenTitles = hidden.titles;
  renderStyle();
  markTitles();
  checkMain();
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

async function main() {
  logseq.provideModel({
    toggle() {
      unlocked = !unlocked;
      renderStyle();
      renderButton();
    },
  });

  logseq.App.onRouteChanged(() => {
    unlocked = false;
    renderStyle();
    renderButton();
  });

  // Tags and blocks change while editing; keep the hidden list current.
  logseq.DB.onChanged(debounce(refresh, 500));

  // Pages render (and lazy-load blocks) after navigation, so watch the DOM
  // to know when hidden content appears in the main view.
  const onDomChange = debounce(() => {
    markTitles();
    checkMain();
  }, 200);
  new MutationObserver(onDomChange).observe(hostDocument.body, {
    childList: true,
    subtree: true,
  });

  renderButton();
  await refresh();
}

logseq.ready(main).catch(console.error);
