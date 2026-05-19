const ROOT_ID = "open-in-another-window";
const NEW_WINDOW_ID = "new-window";
let childIds = new Set();

function truncate(s, n) { return s && s.length > n ? s.slice(0, n - 1) + "…" : s; }
function ignoreLastError() { void chrome.runtime.lastError; }

async function isAllowedIncognitoAccess() {
   return new Promise(resolve => chrome.extension.isAllowedIncognitoAccess(resolve));
}

async function getWindowChoices() {
   let wins = [];
   try {
      wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
   } catch (e) {
      console.error("windows.getAll failed:", e);
      return {
         windows: [],
         hiddenIncognitoCount: 0,
         error: e?.message || String(e)
      };
   }

   const focused = wins.find(w => w.focused) || null;
   const allowIncognito = await isAllowedIncognitoAccess();

   // Windows other than the currently focused/source window.
   const others = wins.filter(w => !focused || w.id !== focused.id);
   const hiddenIncognito = others.filter(w => w.incognito && !allowIncognito);
   const showable = allowIncognito ? others : others.filter(w => !w.incognito);

   return {
      windows: showable.map(w => {
         const active = (w.tabs || []).find(t => t.active);
         const title = truncate(active?.title || `Window ${w.id}`, 60);
         const count = w.tabs?.length ?? 0;
         return {
            id: w.id,
            title,
            tabCount: count,
            incognito: Boolean(w.incognito)
         };
      }),
      hiddenIncognitoCount: hiddenIncognito.length
   };
}

async function openLinkInWindow(url, targetWindowId) {
   await chrome.tabs.create({ windowId: targetWindowId, url, active: true });
   await chrome.windows.update(targetWindowId, { focused: true });
}

async function openLinkInNewWindow(url) {
   await chrome.windows.create({ url });
}

async function rebuildSubmenu() {
   // Remove old children we created (best-effort)
   for (const id of childIds) chrome.contextMenus.remove(id, ignoreLastError);
   childIds.clear();

   const choices = await getWindowChoices();

   if (choices.windows.length === 0) {
      const label = choices.hiddenIncognitoCount > 0
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
   }

   // Add one item per allowed window
   for (const w of choices.windows) {
      const id = `win-${w.id}`;

      chrome.contextMenus.create({
         id,
         parentId: ROOT_ID,
         title: `${w.title} (${w.tabCount} tabs)${w.incognito ? " — Incognito" : ""}`,
         contexts: ["link"]
      }, ignoreLastError);
      childIds.add(id);
   }

   // Keep New window last as the fallback option.
   chrome.contextMenus.create({
      id: NEW_WINDOW_ID,
      parentId: ROOT_ID,
      title: "New window",
      contexts: ["link"]
   }, ignoreLastError);
   childIds.add(NEW_WINDOW_ID);

   chrome.contextMenus.refresh?.();
}

// Build at startup (after extension reloads)
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

// Context-menu click handling
chrome.contextMenus.onClicked.addListener(async (info) => {
   if (!info.linkUrl) return;
   const id = String(info.menuItemId || "");
   if (id === NEW_WINDOW_ID) {
      await openLinkInNewWindow(info.linkUrl);
      return;
   }
   if (id.startsWith("win-")) {
      const targetId = Number(id.slice(4));
      try {
         await openLinkInWindow(info.linkUrl, targetId);
      } catch (e) {
         console.error("open-in-target failed:", e);
      }
   }
});

// Shift+click picker handling from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
   (async () => {
      if (!message || typeof message !== "object") {
         sendResponse({ ok: false, error: "Invalid message" });
         return;
      }

      if (message.type === "OIAW_GET_WINDOW_CHOICES") {
         const choices = await getWindowChoices();
         sendResponse({ ok: true, ...choices });
         return;
      }

      if (message.type === "OIAW_OPEN_LINK") {
         const url = String(message.url || "");
         if (!url) throw new Error("Missing URL");

         if (message.target === "new-window") {
            await openLinkInNewWindow(url);
            sendResponse({ ok: true });
            return;
         }

         if (message.target === "window") {
            const windowId = Number(message.windowId);
            if (!Number.isFinite(windowId)) throw new Error("Missing target window ID");
            await openLinkInWindow(url, windowId);
            sendResponse({ ok: true });
            return;
         }

         throw new Error("Unknown target");
      }

      sendResponse({ ok: false, error: "Unknown message type" });
   })().catch(error => {
      console.error("message handling failed:", error);
      sendResponse({ ok: false, error: error?.message || String(error) });
   });

   return true;
});
