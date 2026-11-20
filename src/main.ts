import "@logseq/libs";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";

const TAG = "obfuscate";
const STYLE_KEY = "obfuscate-style";
const TOOLBAR_KEY = "obfuscate-toggle";
const BLUR = "blur(12px)";
// Shown as the window title instead of a tagged page's name.
const NEUTRAL_TITLE = "Logseq";
// Set on elements that only show a page name (Recent, Favorites, sidebar).
const MARK = "data-obfuscate";

// --- Logseq markup this plugin relies on (checked against Logseq 2.0.2) ---
// Every page renders with `data-page-tags='["Page", "obfuscate"]'`, in the
// main view and in the sidebar alike.
const TAGGED_PAGE = `.page[data-page-tags*='"${TAG}"']`;
const MAIN = "#main-content-container";
// Excludes anything inside the main view, used once the user unlocks it.
const OUTSIDE_MAIN = `:not(${MAIN} *)`;
// Places that show a page name with no uuid: Recent, Favorites and right
// sidebar headers. These are matched by title instead.
const NAME_ONLY = "li .page-title, .sidebar-item-header .page-title";

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

// Where each kind of hidden thing shows up, one selector per place.
function selectors(scope: string) {
  const forBlocks = (make: (uuid: string) => string) =>
    hiddenBlocks.map((uuid) => make(uuid) + scope);
  const forPages = (make: (uuid: string) => string) =>
    hiddenPages.map((uuid) => make(uuid) + scope);
  return {
    // Content: blurred and not interactive.
    content: [
      // The blocks of a tagged page, on the page itself.
      `${TAGGED_PAGE} .ls-page-blocks${scope}`,
      // Those blocks anywhere else: linked references, embeds, previews.
      ...forBlocks((uuid) => `.ls-block[blockid="${uuid}"]`),
    ],
    // Titles and links: blurred but still clickable.
    links: [
      // The heading of a tagged page.
      `${TAGGED_PAGE} .ls-page-title${scope}`,
      // Page links, and block references (which render as links too).
      ...forPages((uuid) => `a.page-ref[data-uuid="${uuid}"]`),
      ...forBlocks((uuid) => `a.page-ref[data-uuid="${uuid}"]`),
      // All pages table: title cells link by href.
      ...forPages((uuid) => `a.page-ref[href="#/page/${uuid}"]`),
      // Tag page table: the title sits inside the page's row.
      ...forPages((uuid) => `[blockid="${uuid}"] .table-block-title`),
      // Page embed: the page's title renders as a block with its uuid.
      ...forPages((uuid) => `.block-content[blockid="${uuid}"]`),
      // Name-only places, marked by markTitles().
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

function isHiddenTitle(text: string | null) {
  return hiddenTitles.has(text?.trim().toLowerCase() ?? "");
}

function markTitles() {
  for (const el of hostDocument.querySelectorAll(NAME_ONLY)) {
    const hidden = isHiddenTitle(el.textContent);
    if (hidden !== el.hasAttribute(MARK)) el.toggleAttribute(MARK, hidden);
  }
}

// The window title is the current page's name, which shows in the title bar
// and window switcher. Replace it while locked, put it back when unlocked.
let realTitle: string | undefined;
function updateWindowTitle() {
  if (unlocked) {
    if (realTitle && hostDocument.title === NEUTRAL_TITLE) {
      hostDocument.title = realTitle;
    }
    realTitle = undefined;
  } else if (isHiddenTitle(hostDocument.title)) {
    realTitle = hostDocument.title;
    hostDocument.title = NEUTRAL_TITLE;
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
  updateWindowTitle();
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
      updateWindowTitle();
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
  // Logseq sets the window title on navigation; replace it right away.
  new MutationObserver(updateWindowTitle).observe(hostDocument.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  renderButton();
  await refresh();
}

logseq.ready(main).catch(console.error);
