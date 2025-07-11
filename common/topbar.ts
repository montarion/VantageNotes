// topbar.ts
import { Logger } from "./logger.ts";
import { setupSearchHandler } from "./search.ts";

const log = new Logger({ namespace: "Topbar" });

const topbar = document.querySelector(".topbar");
if (!topbar) throw new Error("Topbar element not found");

const breadcrumbContainer = document.createElement("nav");
breadcrumbContainer.className = "breadcrumb";

const saveStatus = document.createElement("span");
saveStatus.className = "save-status";


// Add to DOM
topbar.appendChild(breadcrumbContainer);
topbar.appendChild(saveStatus);
setupSearchHandler()
let saveTimeout: number | null = null;

// Update breadcrumb with clickable path
export function updateBreadcrumb(filepath: string) {
  breadcrumbContainer.innerHTML = "";
  const parts = filepath.split("/");

  parts.forEach((part, index) => {
    const span = document.createElement("span");
    span.textContent = part;

    if (index < parts.length - 1) {
      span.className = "breadcrumb-folder";
      span.onclick = () => {
        const subPath = parts.slice(0, index + 1).join("/");
        log.info("Clicked breadcrumb:", subPath);
        // TODO: Hook to navigation or file tree filtering
      };
    } else {
      span.className = "breadcrumb-file";
    }

    breadcrumbContainer.appendChild(span);

    if (index < parts.length - 1) {
      const separator = document.createElement("span");
      separator.textContent = " > ";
      separator.className = "breadcrumb-separator";
      breadcrumbContainer.appendChild(separator);
    }
  });
}

// Show save state
export function showSaveStatus(status: "saving" | "saved" | "unsaved") {
  if (saveTimeout) clearTimeout(saveTimeout);

  if (status === "saving") {
    saveStatus.textContent = "Saving...";
  } else if (status === "saved") {
    saveStatus.textContent = "Saved ✓";
    saveTimeout = window.setTimeout(() => {
      saveStatus.textContent = "";
    }, 2000);
  } else {
    saveStatus.textContent = "Unsaved changes";
  }
}

