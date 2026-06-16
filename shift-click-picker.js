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

   function fitToViewport(x, y, width = 280, height = 330) {
      const margin = 12;
      return {
         left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
         top: Math.max(margin, Math.min(y, window.innerHeight - height - margin))
      };
   }

   function createIcon(iconUrl, fallbackText = "") {
      const icon = document.createElement("span");
      icon.className = "choice-icon";
      icon.setAttribute("aria-hidden", "true");

      if (iconUrl) {
         icon.classList.add("has-image");
         const image = document.createElement("img");
         image.alt = "";
         image.decoding = "async";
         image.referrerPolicy = "no-referrer";
         image.src = iconUrl;
         image.addEventListener("error", () => {
            icon.classList.remove("has-image");
            image.remove();
         });
         icon.appendChild(image);
      } else if (fallbackText) {
         icon.textContent = fallbackText;
      }

      return icon;
   }

   function createButton(label, iconUrl, metaText, onClick, fallbackText = "") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.appendChild(createIcon(iconUrl, fallbackText));

      const main = document.createElement("span");
      main.className = "choice-main";
      main.textContent = label;
      button.appendChild(main);

      if (metaText) {
         const meta = document.createElement("span");
         meta.className = "choice-meta";
         meta.textContent = metaText;
         button.appendChild(meta);
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
            width: 280px;
            max-width: calc(100vw - 24px);
            box-sizing: border-box;
            padding: 4px;
            border: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
            border-radius: 8px;
            background: Canvas;
            color: CanvasText;
            box-shadow:
               0 8px 20px rgba(0, 0, 0, 0.14),
               0 1px 3px rgba(0, 0, 0, 0.12);
         }

         .title {
            box-sizing: border-box;
            margin: -4px -4px 3px;
            padding: 9px 12px 7px;
            border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
            border-radius: 7px 7px 0 0;
            background: color-mix(in srgb, Canvas 92%, CanvasText 8%);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: color-mix(in srgb, CanvasText 84%, transparent);
            font-size: 12.5px;
            font-weight: 650;
            letter-spacing: 0;
         }

         .choices {
            display: grid;
            gap: 1px;
            max-height: 288px;
            overflow: auto;
            overscroll-behavior: contain;
         }

         .separator {
            height: 0;
            margin: 3px 4px 2px;
            border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
         }

         .choice {
            appearance: none;
            display: grid;
            grid-template-columns: 18px minmax(0, 1fr) auto;
            align-items: center;
            gap: 8px;
            width: 100%;
            min-height: 30px;
            box-sizing: border-box;
            padding: 5px 8px;
            border: 0;
            border-radius: 5px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            text-align: left;
            font: inherit;
         }

         .choice:hover {
            background: color-mix(in srgb, Highlight 16%, transparent);
         }

         .choice:active {
            background: color-mix(in srgb, Highlight 24%, transparent);
         }

         .choice:disabled {
            cursor: wait;
            opacity: 0.55;
         }

         .choice:focus-visible {
            outline: 2px solid color-mix(in srgb, Highlight 76%, transparent);
            outline-offset: -2px;
         }

         .choice-icon {
            position: relative;
            display: grid;
            place-items: center;
            width: 16px;
            height: 16px;
            border-radius: 4px;
            color: color-mix(in srgb, CanvasText 70%, transparent);
            font-size: 14px;
            line-height: 1;
            font-weight: 500;
         }

         .choice-icon::before {
            content: "";
            width: 10px;
            height: 10px;
            border-radius: 3px;
            background: color-mix(in srgb, CanvasText 24%, transparent);
         }

         .choice-icon:not(:empty)::before,
         .choice-icon.has-image::before {
            display: none;
         }

         .choice-icon img {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            object-fit: contain;
         }

         .choice-main {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 12.5px;
            font-weight: 500;
            letter-spacing: 0;
         }

         .choice-meta {
            justify-self: end;
            min-width: max-content;
            color: color-mix(in srgb, CanvasText 52%, transparent);
            font-size: 12px;
            font-weight: 450;
            letter-spacing: 0;
            white-space: nowrap;
         }

         .note,
         .error {
            font-size: 12.5px;
            opacity: 0.72;
         }

         .note,
         .error {
            padding: 7px 8px;
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
      title.textContent = "Open the link in...";

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

      function addOpenButton(label, iconUrl, metaText, target, windowId, fallbackText = "") {
         choicesBox.appendChild(createButton(label, iconUrl, metaText, () => {
            choicesBox.querySelectorAll("button").forEach(button => button.disabled = true);
            openChoice(url, target, windowId)
               .then(removePicker)
               .catch(showError);
         }, fallbackText));
      }

      choicesBox.textContent = "";

      if (choicesResponse.windows?.length) {
         for (const win of choicesResponse.windows) {
            const tabCount = `${win.tabCount} tab${win.tabCount === 1 ? "" : "s"}`;
            addOpenButton(win.title || `Window ${win.id}`, win.favIconUrl, tabCount, "window", win.id);
         }
      } else {
         const note = document.createElement("div");
         note.className = "note";
         note.textContent = "No other windows";
         choicesBox.appendChild(note);
      }

      // Keep New window last as the fallback option.
      const separator = document.createElement("div");
      separator.className = "separator";
      separator.setAttribute("role", "separator");
      choicesBox.appendChild(separator);
      addOpenButton("New window", "", "", "new-window", undefined, "+");
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
