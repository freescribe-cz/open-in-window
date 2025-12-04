const ROOT_ID = "open-in-another-window";
let childIds = new Set();

function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : s; }
function ignoreLastError() { void chrome.runtime.lastError; }

async function rebuildSubmenu() {
   // Remove old children we created (best-effort)
   for (const id of childIds) chrome.contextMenus.remove(id, ignoreLastError);
   childIds.clear();

   let wins = [];
   try {
      wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
   } catch (e) {
      console.error("windows.getAll failed:", e);
      return;
   }

   const focused = wins.find(w => w.focused) || null;
   const allowIncognito = await new Promise(r => chrome.extension.isAllowedIncognitoAccess(r));

   // Windows other than the focused one
   const others = wins.filter(w => !focused || w.id !== focused.id);

   // Partition by incognito
   const incog = others.filter(w => w.incognito);
   const nonIncog = others.filter(w => !w.incognito);

   // Build list we're allowed to show
   const showable = allowIncognito ? others : nonIncog;

   if (showable.length === 0) {
      // Explain *why* it's empty
      const label = incog.length > 0 && !allowIncognito
         ? "Incognito windows hidden (enable extension in Incognito)"
         : "No other windows";
      const id = "no-other";
      chrome.contextMenus.create({
         id,
         parentId: ROOT_ID,
         title: label,
         contexts: ["link"],
         enabled: false
      }, ignoreLastError);
      childIds.add(id);
      chrome.contextMenus.refresh?.();
      return;
   }

   // Add one item per allowed window
   for (const w of showable) {
      const active = (w.tabs || []).find(t => t.active);
      const title = truncate(active?.title || `Window ${w.id}`, 40);
      const count = w.tabs?.length ?? 0;
      const id = `win-${w.id}`;

      chrome.contextMenus.create({
         id,
         parentId: ROOT_ID,
         title: `${title} (${count} tabs)${w.incognito ? " — Incognito" : ""}`,
         contexts: ["link"]
      }, ignoreLastError);
      childIds.add(id);
   }

   chrome.contextMenus.refresh?.();
}

// Create root when installed (keeps installer flow)
chrome.runtime.onInstalled.addListener(() => {
   chrome.contextMenus.create({
      id: ROOT_ID,
      title: "Open link in another window",
      contexts: ["link"]
   }, ignoreLastError);
   // build children right away
   rebuildSubmenu();
});

// Also build at startup (after extension reloads)
// NOTE: service worker restarts => state lost; removeAll ensures no stale menu items remain
async function startupInit() {
  // remove anything this extension previously created
  chrome.contextMenus.removeAll(ignoreLastError);

  // recreate root
  chrome.contextMenus.create({
    id: ROOT_ID,
    title: "Open link in another window",
    contexts: ["link"]
  }, ignoreLastError);

  // then build children from current windows
  await rebuildSubmenu();
}

// wire it up
chrome.runtime.onInstalled.addListener(startupInit);
chrome.runtime.onStartup?.addListener?.(startupInit);
startupInit();

// Keep it in sync with window changes
chrome.windows.onCreated.addListener(rebuildSubmenu);
chrome.windows.onRemoved.addListener(rebuildSubmenu);
chrome.windows.onFocusChanged.addListener(() => rebuildSubmenu());
// Reflect tab changes
chrome.tabs.onUpdated.addListener(() => rebuildSubmenu());
chrome.tabs.onDetached.addListener(rebuildSubmenu);
chrome.tabs.onAttached.addListener(rebuildSubmenu);

// Click handling
chrome.contextMenus.onClicked.addListener(async (info) => {
   if (!info.linkUrl) return;
   const id = String(info.menuItemId || "");
   if (id === "new-window") {
      await chrome.windows.create({ url: info.linkUrl });
      return;
   }
   if (id.startsWith("win-")) {
      const targetId = Number(id.slice(4));
      try {
         await chrome.tabs.create({ windowId: targetId, url: info.linkUrl, active: true });
         await chrome.windows.update(targetId, { focused: true });
      } catch (e) {
         console.error("open-in-target failed:", e);
      }
   }
});
