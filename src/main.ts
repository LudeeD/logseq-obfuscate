import "@logseq/libs";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin";

const TAG = "obfuscate";
const STYLE_KEY = "obfuscate-style";
const TOOLBAR_KEY = "obfuscate-toggle";

// Logseq renders every page with `data-page-tags='["Page", "obfuscate"]'`,
// in the main view and in the sidebar alike.
const TAGGED_PAGE = `.page[data-page-tags*='"${TAG}"']`;
// Excludes anything inside the main view, used once the user unlocks it.
const OUTSIDE_MAIN = ":not(#main-content-container *)";

// Is the page in the main view tagged, and has the user unlocked it?
// Both reset on every navigation, so leaving a page always locks it again.
let currentTagged = false;
let unlocked = false;
// Uuids of every block on a tagged page, so they stay hidden when they show
// up elsewhere (linked references, embeds).
let hiddenBlocks: string[] = [];

function render() {
  const scope = unlocked ? OUTSIDE_MAIN : "";
  const selectors = [
    TAGGED_PAGE + scope,
    ...hiddenBlocks.map((uuid) => `.ls-block[blockid="${uuid}"]${scope}`),
  ];
  logseq.provideStyle({
    key: STYLE_KEY,
    style: `
      ${selectors.join(",\n")} {
        filter: blur(12px);
        pointer-events: none;
        user-select: none;
      }
    `,
  });

  logseq.App.registerUIItem("toolbar", {
    key: TOOLBAR_KEY,
    template: currentTagged
      ? `<a class="button" data-on-click="toggle" title="${unlocked ? "Lock page" : "Unlock page"}">
           <i class="ti ${unlocked ? "ti-lock-open" : "ti-lock"}"></i>
         </a>`
      : "<span></span>",
  });
}

function flatten(blocks: BlockEntity[]): string[] {
  return blocks.flatMap((block) => [
    block.uuid,
    ...flatten((block.children ?? []) as BlockEntity[]),
  ]);
}

// User tags have idents with a random suffix, so look them up by name.
async function collectHiddenBlocks(): Promise<string[]> {
  const tags = (await logseq.Editor.getTagsByName(TAG)) ?? [];
  const uuids: string[] = [];
  for (const tag of tags) {
    const objects = (await logseq.Editor.getTagObjects(tag.uuid)) ?? [];
    for (const object of objects) {
      uuids.push(object.uuid);
      const tree = await logseq.Editor.getPageBlocksTree(object.uuid);
      if (tree) uuids.push(...flatten(tree));
    }
  }
  return uuids;
}

async function isCurrentPageTagged(): Promise<boolean> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return false;
  const tags = (await logseq.Editor.getTagsByName(TAG)) ?? [];
  const pageTags = (page.tags as number[] | undefined) ?? [];
  return tags.some((tag) => pageTags.includes(tag.id));
}

// Guards against a slow refresh overwriting a newer one.
let refreshVersion = 0;

async function refresh() {
  const version = ++refreshVersion;
  const [blocks, tagged] = await Promise.all([
    collectHiddenBlocks(),
    isCurrentPageTagged(),
  ]);
  if (version !== refreshVersion) return;
  [hiddenBlocks, currentTagged] = [blocks, tagged];
  render();
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 500);
}

async function main() {
  logseq.provideModel({
    toggle() {
      unlocked = !unlocked;
      render();
    },
  });

  logseq.App.onRouteChanged(() => {
    unlocked = false;
    refresh();
  });

  // Tags and blocks change while editing; keep the hidden list current.
  logseq.DB.onChanged(refreshSoon);

  await refresh();
}

logseq.ready(main).catch(console.error);
