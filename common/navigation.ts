import { newEditor } from "./editor.ts";
import { createTab, getActivePane, getActiveTab, getCurrentTab, openEditorTab, setActivePane } from "./tabs.ts";
import { showSaveStatus } from "./topbar.ts";
import { Logger } from './logger.ts';
import { eventBus } from "./events.ts";
import { showMetadataPanel } from "./metadatapanel.ts";

const log = new Logger({ namespace: 'Navigation', minLevel: 'debug' });

export async function fetchFileTree(treeEl: HTMLElement = document.createElement("div")): Promise<HTMLElement> {
  log.debug("fetching filetree");
  const response = await fetch("/api/notes");
  const tree = await response.json();
  treeEl.innerHTML = "";
  renderTree(tree, treeEl);
  return treeEl;
}

export async function generateNavigation(paneId = "pane1") {
  // Create navigation tab in specified pane
    createTab({
      paneId: paneId,
      tabId: "nav",
      title: "Navigation",
      contentEl: await fetchFileTree(),
      isEditor: false,
    })
  
}

export async function loadFile(filename: string): Promise<string> {
  const response = await fetch("/notes/" + filename);
  if (!response.ok) throw new Error("Failed to fetch file");
  return await response.text();
}

export async function openNavigationTab(paneId = "left") {
  // Query container by data-pane attribute, not data-id
  const container = document.querySelector(`.container[data-pane="${paneId}"]`) as HTMLElement;
  if (!container) {
    console.error(`Container for pane "${paneId}" not found`);
    return;
  }

  container.innerHTML = '<div id="file-tree"></div>';
  await fetchFileTree(container.querySelector("#file-tree")!);
}

export async function saveFile(text: string, filename: string | null = null) {
  if (!filename) {
    const activeTab = getCurrentTab();
    if (!activeTab) {
      return;
    }
    filename = activeTab.title;
  }

  const res = await fetch("/notes/" + filename, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: text,
  });

  if (!res.ok) {
    log.error(`Failed to save file: ${filename}`);
    return;
  }

  log.info(`Saved ${filename}`);
  eventBus.emit("fileSaved", { filename });
  showSaveStatus("saved");
}

export function getInitialFileFromURL(): string | null {
  const path = decodeURIComponent(window.location.pathname);
  if (path && path !== "/") {
    const cleaned = path.startsWith("/") ? path.slice(1) : path;
    return cleaned;
  }
  return null;
}

window.addEventListener("popstate", () => {
  const file = getInitialFileFromURL();
  if (file) {
    openEditorTab("pane2", file);  // Default to main pane here
  }
});

function renderTree(nodes: any[], container: HTMLElement, parentPath = "") {
  const ul = document.createElement("ul");

  for (const node of nodes) {
    node.filepath = parentPath ? `${parentPath}/${node.name}` : node.name;
    const li = document.createElement("li");

    if (node.type === "folder") {
      const span = document.createElement("span");
      span.textContent = "▶ " + node.name;
      span.className = "folder";
      let expanded = false;

      const childrenContainer = document.createElement("div");
      childrenContainer.style.display = "none";

      span.onclick = () => {
        expanded = !expanded;
        span.textContent = (expanded ? "▼ " : "▶ ") + node.name;
        childrenContainer.style.display = expanded ? "block" : "none";
      };

      li.appendChild(span);
      renderTree(node.children || [], childrenContainer, node.filepath);
      li.appendChild(childrenContainer);
    } else {
      const file = document.createElement("div");
      file.textContent = node.name;
      file.className = "file";

      // Remove extension for editor tab ID
      node.filepath = node.filepath.replace(/\.[^.]+$/, "");

      file.onclick = () => openEditorTab(getActivePane(), node.filepath); // open navigation files on left pane by default
      li.appendChild(file);
    }

    ul.appendChild(li);
  }

  container.appendChild(ul);
  return container;
}



export async function createFile({ filename = "nameless", content = "" } = {}) {
  await saveFile(content, filename);
}

// Example: support creating new file in any pane (default "left")
export function setupNavigationTab(paneId = "pane2") {
  document.getElementById("new-file-btn")?.addEventListener("click", async () => {
    let fileName = prompt("Enter new file name (e.g., note):");
    if (!fileName) return;

    if (fileName.endsWith(".md")) {
      fileName = fileName.slice(0, -3);
    }

    await createFile({ filename: fileName, content: "" });
    openEditorTab(paneId, fileName);
    eventBus.emit("refreshFileList");
    //fetchFileTree();
  });
}
