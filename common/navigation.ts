import { getActiveTab, openEditorTab } from "./tabs.ts";
import { showSaveStatus } from "./topbar.ts";
import { Logger } from './logger.ts';
import { eventBus } from "./events.ts";
import Fuse from "npm:fuse.js"
import { CodeBlock, PageMetadata } from "./metadata.ts";
import { setOutput } from "../cm_plugins/htmlOutputPlugin.ts";


const log = new Logger({ namespace: 'Navigation', minLevel: 'debug' });

let fuse;

type FileEntry = {
  name: string;
  type: "file" | "folder";
  children?: FileEntry[];
};

function flattenFilePaths(entries: FileEntry[], prefix = ""): string[] {
  const paths: string[] = [];

  for (const entry of entries) {
    const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.type === "file") {
      paths.push(currentPath);
    } else if (entry.children && entry.children.length > 0) {
      paths.push(...flattenFilePaths(entry.children, currentPath));
    }
  }

  return paths;
}

export async function initFuse() {
  fuse = new Fuse([""], { includeScore: true, threshold: 0.4 });
}

export function searchFuse(query: string) {
  let res = fuse?.search(query) ?? [];
  log.debug("[fuse] - ", res)
  return res
}


export async function getFileList() {
  const response = await fetch("/api/notes");
  const tree = await response.json();
  updateFuseWithFilenames(flattenFilePaths(tree))
  return tree
}

export function updateFuseWithFilenames(newList: string[]) {
  fuse = new Fuse(newList, { includeScore: true, threshold: 0.4 });
}
export async function fetchFileTree(treeEl: HTMLElement = document.createElement("div")): Promise<HTMLElement> {
  const tree = await getFileList()
  treeEl.innerHTML = "";
  renderTree(tree, treeEl);
  return treeEl;
}

export async function generateNavigation(paneId = "pane1") {
    await initFuse()
    await getFileList()
    let navbar = document.querySelector(".navigation")
    await fetchFileTree(navbar)
    
    //navbar?.append()
  
}

export async function loadFile(filename: string): Promise<string> {
  // first check cache/metadatastore
  const response = await fetch("/notes/" + filename);
  if (!response.ok) return "";
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
    const activeTab = getActiveTab();
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

export async function postMetadata(filename: string, metadata: PageMetadata){
  log.warn("POSTING METADATA")
  const response = await fetch("/api/metadata", {
    method: "POST",
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filename,
      metadata
    })
  });
  //const tree = await response.json();
  //updateFuseWithFilenames(flattenFilePaths(tree))
  //return tree
}



window.addEventListener("popstate", () => {
  const file = getInitialFileFromURL();
  if (file) {
    openEditorTab({paneId:"pane2", filename:file});  // Default to main pane here
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

      file.onclick = () => openEditorTab({filename:node.filepath}); // open navigation files on left pane by default
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



export function toggleNavigation() {
  const navigation = document.querySelector('.navigation');
  navigation.style.display = (navigation.style.display === 'none') ? 'block' : 'none';
}

export function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  sidebar.style.display = (sidebar.style.display === 'none') ? 'block' : 'none';
}