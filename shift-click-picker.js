(() => {
   const HOST_ID = "open-in-window-shift-click-picker";

   function sendMessage(message) {
      return new Promise((resolve, reject) => {
         chrome.runtime.sendMessage(message, response => {
            const err = chrome.runtime.lastError;
            if (err) {
               reject(new Error(err.message));
               return;
            }
            resolve(response);
         });
      });
   }

   function removePicker() {
      document.getElementById(HOST_ID)?.remove();
      document.removeEventListener("keydown", onEscape, true);
   }

   function onEscape(event) {
      if (event.key === "Escape") removePicker();
   }

   function findAnchor(event) {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      for (const item of path) {
         if (item instanceof HTMLAnchorElement && item.href) return item;
      }

      let target = event.target;
      if (target?.nodeType === Node.TEXT_NODE) target = target.parentElement;
      return target?.closest?.("a[href]") || null;
   }

   function fitToViewport(x, y, width = 320, height = 420) {
      const margin = 12;
      return {
         left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
         top: Math.max(margin, Math.min(y, window.innerHeight - height - margin))
      };
   }

   function createButton(label, sublabel, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";

      const main = document.createElement("span");
      main.className = "choice-main";
      main.textContent = label;
      button.appendChild(main);

      if (sublabel) {
         const secondary = document.createElement("span");
         secondary.className = "choice-secondary";
         secondary.textContent = sublabel;
         button.appendChild(secondary);
      }

      button.addEventListener("click", onClick);
      return button;
   }

   async function openChoice(url, target, windowId) {
      const response = await sendMessage({
         type: "OIAW_OPEN_LINK",
         target,
         windowId,
         url
      });

      if (!response?.ok) {
         throw new Error(response?.error || "Could not open link");
      }
   }

   function showPicker(url, x, y, choicesResponse) {
      removePicker();

      const host = document.createElement("div");
      host.id = HOST_ID;
      document.documentElement.appendChild(host);

      const shadow = host.attachShadow({ mode: "open" });
      const position = fitToViewport(x, y);

      const style = document.createElement("style");
      style.textContent = `
         :host {
            all: initial;
            color-scheme: light dark;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         }

         .backdrop {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            background: transparent;
         }

         .panel {
            position: fixed;
            left: ${position.left}px;
            top: ${position.top}px;
            z-index: 2147483647;
            width: 320px;
            max-width: calc(100vw - 24px);
            box-sizing: border-box;
            padding: 10px;
            border: 1px solid rgba(128, 128, 128, 0.35);
            border-radius: 14px;
            background: Canvas;
            color: CanvasText;
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
         }

         .title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin: 0 0 8px;
            font-size: 13px;
            font-weight: 700;
         }

         .close {
            appearance: none;
            border: 0;
            border-radius: 999px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font: inherit;
            width: 26px;
            height: 26px;
         }

         .close:hover,
         .choice:hover {
            background: color-mix(in srgb, CanvasText 10%, transparent);
         }

         .choices {
            display: grid;
            gap: 6px;
            max-height: 330px;
            overflow: auto;
         }

         .choice {
            appearance: none;
            display: grid;
            gap: 2px;
            width: 100%;
            box-sizing: border-box;
            padding: 9px 10px;
            border: 0;
            border-radius: 10px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            text-align: left;
            font: inherit;
         }

         .choice:disabled {
            cursor: wait;
            opacity: 0.55;
         }

         .choice:focus-visible,
         .close:focus-visible {
            outline: 2px solid Highlight;
            outline-offset: 2px;
         }

         .choice-main {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            font-weight: 650;
         }

         .choice-secondary,
         .note,
         .error {
            font-size: 12px;
            opacity: 0.72;
         }

         .note,
         .error {
            padding: 8px 10px;
         }

         .error {
            color: #b00020;
         }
      `;

      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.addEventListener("click", removePicker);

      const panel = document.createElement("div");
      panel.className = "panel";
      panel.addEventListener("click", event => event.stopPropagation());

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "Open link in…";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "close";
      close.setAttribute("aria-label", "Close");
      close.textContent = "×";
      close.addEventListener("click", removePicker);
      title.appendChild(close);

      const choicesBox = document.createElement("div");
      choicesBox.className = "choices";

      panel.append(title, choicesBox);
      shadow.append(style, backdrop, panel);
      document.addEventListener("keydown", onEscape, true);

      function showError(error) {
         choicesBox.textContent = "";
         const message = document.createElement("div");
         message.className = "error";
         message.textContent = error?.message || String(error);
         choicesBox.appendChild(message);
      }

      function addOpenButton(label, sublabel, target, windowId) {
         choicesBox.appendChild(createButton(label, sublabel, () => {
            choicesBox.querySelectorAll("button").forEach(button => button.disabled = true);
            openChoice(url, target, windowId)
               .then(removePicker)
               .catch(showError);
         }));
      }

      choicesBox.textContent = "";

      if (choicesResponse.windows?.length) {
         for (const win of choicesResponse.windows) {
            const sublabel = `${win.tabCount} tab${win.tabCount === 1 ? "" : "s"}${win.incognito ? " — Incognito" : ""}`;
            addOpenButton(win.title || `Window ${win.id}`, sublabel, "window", win.id);
         }
      } else {
         const note = document.createElement("div");
         note.className = "note";
         note.textContent = choicesResponse.hiddenIncognitoCount > 0
            ? "No available regular windows. Incognito windows are hidden unless the extension is enabled in Incognito."
            : "No other windows are currently open.";
         choicesBox.appendChild(note);
      }

      // Keep New window last as the fallback option.
      addOpenButton("New window", "Open this link in a fresh Chrome window", "new-window");
   }

   async function handleShiftClick(url, x, y) {
      const response = await sendMessage({ type: "OIAW_GET_WINDOW_CHOICES" });
      if (!response?.ok) throw new Error(response?.error || "Could not load windows");

      // If there is exactly one available target window, use it directly.
      // This is the common two-window case: current window + one other window.
      if (response.windows?.length === 1) {
         await openChoice(url, "window", response.windows[0].id);
         return;
      }

      showPicker(url, x, y, response);
   }

   document.addEventListener("click", event => {
      // Exact Shift+left-click only. Other modifier combinations keep their normal browser/page behavior.
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.button !== 0) return;

      const anchor = findAnchor(event);
      if (!anchor?.href) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      handleShiftClick(anchor.href, event.clientX, event.clientY).catch(error => {
         console.error("open-in-window Shift+click failed:", error);
         showPicker(anchor.href, event.clientX, event.clientY, { windows: [], hiddenIncognitoCount: 0 });
      });
   }, true);
})();
