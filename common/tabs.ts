//tabs.ts

import { newEditor } from "./editor.ts";
import { fetchFileTree, loadFile } from "./navigation.ts";
import { updateBreadcrumb, showSaveStatus } from "./topbar.ts";
import { showMetadataPanel } from './metadatapanel.ts';
import { Logger } from "./logger.ts";
import { shortUUID } from "./pluginhelpers.ts";

const log = new Logger({ namespace: "Tabs", minLevel: "debug" });

const STORAGE_KEY = "openTabs";
const STORAGE_ACTIVE = "activeTab";

type Tab = {
  id: string;
  title: string;
  contentEl: HTMLElement;
  isEditor?: boolean;
};

type TabCreation = {
  paneId?: string;
  tabId?: string;
  title: string;
  contentEl: HTMLElement;
  isEditor?: boolean;
};

const allTabs = new Map<string, Tab>();
// Map paneId => Map of tabs for that pane
const tabsByPane = new Map<string, Map<string, Tab>>();
// Map paneId => active tab id in that pane
const activeTabsByPane = new Map<string, string>();
// Map paneId => HTMLElement for tab content container
const tabContents = new Map<string, HTMLElement>();

const tabContentsByPane = new Map<string, Map<string, HTMLElement>>();
// Store tab bars and content containers per pane
const tabBars = new Map<string, HTMLElement>();
const contentContainers = new Map<string, HTMLElement>();
let spinner: HTMLElement | null = null;

export async function initTabs() {
  log.info("Initializing tabs...");
  GetPane("pane1")
  // create fallback tab
  //let container = document.createElement("div")
  //container.textContent = "Welcome to the homepage!"
  //createTab({
  //  paneId: "pane2",
  //  title: "homepage",
  //  contentEl: container,
  //  isEditor: true
  //})

  // Restore saved tabs
  //await restoreTabs()
}

/**
 * Creates a new pane container with tab-bar and tab-content elements.
 * @param {string} [paneId] Optional pane ID. If omitted, a new unique ID is generated.
 * @returns {string} The ID of the newly created pane.
 */
export function GetPane(paneId?: string): Map<string, Tab> {
  if (!paneId) {
    paneId = `pane_${shortUUID()}`;
  }
  if (tabsByPane.has(paneId)) {
    return tabsByPane.get(paneId)!;
  }

  // Create container div
  const container = document.createElement("div");
  container.className = "container";
  container.dataset.pane = paneId;

  // Create tab-bar div
  const tabBar = document.createElement("div");
  tabBar.className = "tab-bar";
  tabBar.dataset.pane = paneId;

  // Create tab-content div
  const tabContent = document.createElement("div");
  tabContent.className = "tab-content";
  tabContent.dataset.pane = paneId;
  tabContent.addEventListener("click", (e) => {
    let tabcontainer = e.target.closest("[data-id]")
    let tabId = tabcontainer.dataset.id
    setCurrentTab(tabId)
  });

  // Append tabBar and tabContent to container
  container.append(tabBar);
  container.append(tabContent);

  // Append container to your main panes wrapper (adjust this selector)
  const main = document.getElementsByTagName('main')[0]
  
  // update ui
  setupTabBarDragAndDrop(tabBar, paneId);

  main.append(container);

  // Initialize data structures
  const paneTabs = new Map<string, Tab>();
  tabsByPane.set(paneId, paneTabs);
  tabBars.set(paneId, tabBar);
  tabContents.set(paneId, tabContent);

  activeTabsByPane.set(paneId, "")
  log.error(tabsByPane.get(paneId))
  return tabsByPane.get(paneId)!;
}
/**
 * Retrieves the tab bar element for a given pane ID, creating it if necessary.
 * Will call `GetPane()` to ensure the DOM structure and maps are initialized.
 *
 * @param paneId - The ID of the pane to retrieve the tab bar for.
 * @returns The HTMLElement representing the tab bar.
 */
function GetTabBar(paneId?: string): HTMLElement {
  if (!paneId) {
    paneId = `pane_${shortUUID()}`;
  }

  // Reuse GetPane to ensure everything is created
  GetPane(paneId);

  return tabBars.get(paneId)!;
}
export function createTab({
  paneId = "pane2",
  tabId = shortUUID(),
  title,
  contentEl,
  isEditor = true,
}: TabCreation): Tab {
  log.debug(`Creating tab [${tabId}] in pane [${paneId}]`);

  let paneTabs = GetPane(paneId)
  
  if (paneTabs.has(tabId)) {
    switchToTab(paneId, tabId);
    return paneTabs.get(tabId)!; // Return existing tab
  }

  const tab: Tab = { id:tabId, title, contentEl, isEditor };
  // link content to tab with id
  contentEl.dataset.id = tabId
  log.debug(`Adding tab[${tabId}] to Alltabs with contentId ${contentEl.dataset.id} and content`, contentEl)
  allTabs.set(tabId, tab)
  upsertTab(paneId, tab)

  renderTabsUI(paneId);

  return tab;
}

/**
 * Attaches click event listeners to all `.tab` elements within a tab bar,
 * ensuring that only one tab at a time has the "active" class.
 *
 * @param {string} paneId - The ID of the pane whose tab bar should be processed.
 *
 * This function should typically be called once when setting up a tab bar.
 * It ensures any previously active tab has its "active" class removed when a tab is clicked.
 */
export function removeActiveClass(paneId: string){
  let bar = document.querySelector(`.tab-bar[data-pane="${paneId}"]`)
  bar.querySelectorAll('.tab').forEach(tab => {
      // Remove active class from all tabs
      tab.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  });
}

/**
 * Switches to a specified tab in a given pane.
 *
 * - Updates internal state to mark the tab as current.
 * - Applies the "active" class to the tab element.
 * - Updates the visible content for the active tab.
 *
 * @param {string} paneId - The ID of the pane where the tab switch is occurring.
 * @param {string} tabId - The ID of the tab to switch to.
 */
export function switchToTab(paneId: string, tabId: string) {
  const tab = allTabs.get(tabId);
if (!tab) return;

setCurrentTab(tabId)
// change which button has the active class
let tabEl = document.querySelector(`.tab[data-id="${tabId}"]`)
GetPane(paneId)

activeTabsByPane.set(paneId, tabId)
updateTabContentDisplay(paneId, tab.contentEl)

removeActiveClass(paneId)
setActivePane(paneId)

setContent(paneId, getContentWithId(tab.id))
}



/**
 * Closes a tab within a specified pane. This removes the tab's data,
 * button, and content, and updates the UI state accordingly.
 *
 * @param {string} paneId - The ID of the pane the tab belongs to.
 * @param {string} id - The unique ID of the tab to close.
 *
 * @remarks
 * - If the tab is currently active, its content is cleared.
 * - If the pane or tab doesn't exist, the function exits safely.
 * - Also updates the tab bar UI via `renderTabsUI(paneId)`.
 */
function closeTab(paneId: string, id: string) {
  const paneTabs = tabsByPane.get(paneId);
  const tabBar = tabBars.get(paneId);
  const contentContainer = contentContainers.get(paneId);

  if (!paneTabs || !tabBar || !contentContainer) return;
  if (!paneTabs.has(id)) return;

  // Remove tab from data structures
  paneTabs.delete(id);
  const paneContents = tabContentsByPane.get(paneId);
  if (paneContents) {
    paneContents.delete(id);
  }
  tabContents.delete(id);

  // If the closed tab is active, clear it and remove active reference
  if (activeTabsByPane.get(paneId) === id) {
    contentContainer.innerHTML = "";
    activeTabsByPane.delete(paneId);
  }

  // Remove tab button from the DOM
  const tabButton = tabBar.querySelector(`[data-tab-id="${id}"]`);
  if (tabButton) {
    tabBar.removeChild(tabButton);
  }

  renderTabsUI(paneId);
}


/**
 * Renders the tab UI for a given pane.
 * @param paneId - The ID of the pane to render tabs for.
 */
function renderTabsUI(paneId: string) {
  const paneTabs = GetPane(paneId);
  const tabBar = GetTabBar(paneId);
  const activeId = getCurrentTab()?.id

  if (!tabBar) {
    return;
  }

  tabBar.innerHTML = "";

  paneTabs.forEach((tab) => {
    if (!tab) return;

    const { id, title } = tab;
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.textContent = title;
    btn.dataset.id = id;
    btn.dataset.pane = paneId;
    if (id === activeId) btn.classList.add("active");

    btn.draggable = true;
    btn.addEventListener("click", (e) => {
      let id = e.target.dataset.id
      switchToTab(paneId, id);
    })
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", id);
      e.dataTransfer?.setData("text/pane", paneId);
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setDragImage(btn, 0, 0);
    });

    btn.addEventListener("dragover", (e) => {
      e.preventDefault();
      btn.classList.add("drag-over");
    });

    btn.addEventListener("dragleave", () => {
      btn.classList.remove("drag-over");
    });

    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      btn.classList.remove("drag-over");
      const draggedId = e.dataTransfer?.getData("text/plain");
      const draggedPane = e.dataTransfer?.getData("text/pane") || paneId;
      if (!draggedId || draggedId === id) return;
      reorderTabs(draggedPane, draggedId, paneId, id);
    });

    

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "✕";
    closeBtn.className = "close";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      //closeTab(paneId, id);
      removeTab(paneId, tab.id)
    };

    btn.append(closeBtn);
    tabBar.append(btn);
  });
}

function saveTabs() {
  const toSave: Record<string, { id: string; title: string; isEditor?: boolean }[]> = {};
  tabsByPane.forEach((paneTabs, paneId) => {
    toSave[paneId] = Array.from(paneTabs.values()).map(({ id, title, isEditor }) => ({
      id,
      title,
      isEditor,
    }));
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

  const activeSave: Record<string, string> = {};
  activeTabsByPane.forEach((activeId, paneId) => {
    activeSave[paneId] = activeId;
  });

  localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(activeSave));
}

async function restoreTabs() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const activeSaved = localStorage.getItem(STORAGE_ACTIVE);

  if (!saved || !activeSaved) {
    console.warn("No saved tabs to restore");
    return;
  }

  const savedTabs: Record<string, { id: string; title: string; isEditor?: boolean }[]> = JSON.parse(saved);
  const savedActive: Record<string, string> = JSON.parse(activeSaved);

  tabsByPane.clear();
  activeTabsByPane.clear();

  for (const paneId in savedTabs) {
    const paneTabsArray = savedTabs[paneId];
    const paneTabsMap = new Map<string, Tab>();

    for (const tabData of paneTabsArray) {
      // Assuming you have a way to recreate content element, or you can use placeholders
      // Replace this with your actual content creation logic, maybe fetchFileTree or similar
      const contentEl = document.createElement("div"); // Placeholder empty div

      paneTabsMap.set(tabData.id, {
        id: tabData.id,
        title: tabData.title,
        contentEl,
        isEditor: tabData.isEditor,
      });
    }

    tabsByPane.set(paneId, paneTabsMap);

    if (savedActive[paneId]) {
      activeTabsByPane.set(paneId, savedActive[paneId]);
    }
  }

  // After restoring, you might want to re-render your tabs UI for all panes
  tabsByPane.forEach((_tabs, paneId) => {
    renderTabsUI(paneId);
  });
}

function reorderTabs(
  fromPane: string,
  draggedId: string,
  toPane: string,
  targetId?: string | null
) {
  if (draggedId === targetId && fromPane === toPane) return;

  const fromTabs = tabsByPane.get(fromPane);
  const toTabs = tabsByPane.get(toPane);
  const fromContent = tabContents.get(fromPane);
  const toContent = tabContents.get(toPane);

  if (!fromTabs || !toTabs || !fromContent || !toContent) return;
  if (!fromTabs.has(draggedId)) return;
  if (targetId && !toTabs.has(targetId)) return;

  const draggedTab = fromTabs.get(draggedId)!;

  // Move contentEl to new container
  if (draggedTab.contentEl.parentElement === fromContent) {
    fromContent.removeChild(draggedTab.contentEl);
  }
  toContent.appendChild(draggedTab.contentEl);

  // Clean up from old tab map
  fromTabs.delete(draggedId);

  // Insert into new tab map at correct location
  const newTabs = new Map<string, Tab>();
  let inserted = false;

  for (const [key, tab] of toTabs) {
    if (!inserted && key === targetId) {
      newTabs.set(draggedId, draggedTab);
      inserted = true;
    }
    newTabs.set(key, tab);
  }

  if (!inserted) {
    newTabs.set(draggedId, draggedTab);
  }

  tabsByPane.set(toPane, newTabs);

  // Set the moved tab as active in its new pane
  activeTabsByPane.set(toPane, draggedId);

  const fromContentMap = tabContentsByPane.get(fromPane);
  const toContentMap = tabContentsByPane.get(toPane);

  if (fromContentMap && toContentMap && fromContentMap.has(draggedId)) {
    const contentEl = fromContentMap.get(draggedId)!;
    fromContentMap.delete(draggedId);
    toContentMap.set(draggedId, contentEl);
  }
  renderTabsUI(fromPane);
  renderTabsUI(toPane);

  saveTabs();
}



export function hasOpenTabs(paneId: string): boolean {
  const paneTabs = tabsByPane.get(paneId);
  return !!paneTabs && paneTabs.size > 0;
}
/**
 * Retrieves the tab map for a given paneId, or creates it if it doesn't exist.
 * @param paneId - The ID of the pane.
 * @returns The Map of tab ID to Tab for the specified pane.
 */
function getOrCreatePaneTabs(paneId: string): Map<string, Tab> {
  let paneTabs = tabsByPane.get(paneId);
  if (!paneTabs) {
    paneTabs = new Map<string, Tab>();
    tabsByPane.set(paneId, paneTabs);
  }
  return paneTabs;
}
/**
 * Adds a new tab or updates an existing tab in the specified pane.
 *
 * @param paneId - The ID of the pane to insert the tab into.
 * @param tab - The Tab object to insert or update.
 */
function upsertTab(paneId: string, tab: Tab) {
  // Get the paneTabs map or create a new one
  if (!tab || typeof tab.id !== "string") {
    throw new Error("Invalid tab");
  }
  const paneTabs = getOrCreatePaneTabs(paneId);

  // Add or update the tab
  paneTabs.set(tab.id, tab);

  if (!tabContentsByPane.has(paneId)) {
    tabContentsByPane.set(paneId, new Map());
  }
  tabContentsByPane.get(paneId)!.set(tab.id, tab.contentEl);
  
  tabsByPane.set(paneId, paneTabs);
}

function updateTabContentDisplay(paneId: string, tabContent: HTMLElement) {
  const activeId = activeTabsByPane.get(paneId);
  const container = document.querySelector(`.tab-content[data-pane="${paneId}"]`)

  if (!container || !tabContent) return;
  // log mismatches
  if (tabContent.parentElement && tabContent.parentElement !== container) {
      
    tabContent.parentElement.removeChild(tabContent); // move it
  }

  // Only remove if the contentEl is not already in the correct container
  if (!container.contains(tabContent)) {
    container.innerHTML = "";
  }

  if (activeId) {
    container.append(tabContent);
  }
  renderTabsUI(paneId)
}
export function setContent(paneId: string, content: HTMLElement){
  // find tab-content element
  let contentEl = document.querySelector(`.tab-content[data-pane="${paneId}"]`)
  contentEl.innerHTML = ""
  contentEl?.append(content)
}

function removeTab(paneId: string, tabId: string) {
  const paneTabs = tabsByPane.get(paneId);
  const contentMap = tabContentsByPane.get(paneId);
  const activeId = activeTabsByPane.get(paneId);

  // Remove from tabsByPane
  if (paneTabs) {
    paneTabs.delete(tabId);
    if (paneTabs.size === 0) {
      tabsByPane.delete(paneId);
    }
  }

  // Remove content from content map
  if (contentMap) {
    contentMap.delete(tabId);
    if (contentMap.size === 0) {
      tabContentsByPane.delete(paneId);
    }
  }

  // If removed tab was active, unset it
  if (activeId === tabId) {
    activeTabsByPane.set(paneId, "");

    // Clear visible tab content
    const container = tabContents.get(paneId);
    if (container) container.innerHTML = "";
  }

  // Re-render the UI and save state
  renderTabsUI(paneId);
  updateTabContentDisplay(paneId);
  saveTabs();
}

export function setActivePane(paneId: string){
  localStorage.setItem("CurrentPane", paneId)
}
export function getActivePane(): string{
  let id = localStorage.getItem("CurrentPane")
  return id
}
export function getActiveTab(paneId: string): Tab | null {
  const activeId = activeTabsByPane.get(paneId);
  const paneTabs = tabsByPane.get(paneId);
  return activeId && paneTabs && paneTabs.has(activeId) ? paneTabs.get(activeId)! : null;
}
function setCurrentTab(id: string){
  localStorage.setItem("CurrentTab", id)
  let tab = getCurrentTab()
  history.pushState({}, '', '/' + encodeURI(tab?.title ?? ''));
  const filename = tab?.title ?? 'Untitled Note';
  document.title = `${filename} – VantageNotes`;
}
export function getCurrentTab(): Tab | null {
  let id = localStorage.getItem("CurrentTab")
  return allTabs.get(id)
}

export function showLoading(paneId: string, visible: boolean) {
  if (!spinner) return;
  spinner.style.display = visible ? "inline-block" : "none";
  const contentContainer = contentContainers.get(paneId);
  if (!contentContainer) return;
  contentContainer.style.display = visible ? "none" : "block";
}



export function setupContainerDragAndDrop(paneId: string) {
  const container = contentContainers.get(paneId);
  if (!container) return;

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    container.classList.add("drag-over");
  });

  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-over");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
  });
}

export function setupTabBarDragAndDrop(tabBar: HTMLElement, paneId: string) {
  tabBar.addEventListener("dragover", (e) => {
    e.preventDefault();
    tabBar.classList.add("drag-over");
  });

  tabBar.addEventListener("dragleave", () => {
    tabBar.classList.remove("drag-over");
  });

  tabBar.addEventListener("drop", (e) => {
    e.preventDefault();
    tabBar.classList.remove("drag-over");

    const draggedId = e.dataTransfer?.getData("text/plain");
    const fromPane = e.dataTransfer?.getData("text/pane");

    if (!draggedId || !fromPane) return;

    // Drop at the *end* of the target pane's tab list
    reorderTabs(fromPane, draggedId, paneId, null);
  });
}
/**
 * Opens an editor tab in the specified pane with the given file.
 * Creates the tab if it doesn't exist and loads file content into the editor.
 *
 * @param paneId - The pane (left, right, etc.) where the tab should be opened.
 * @param filename - The name of the file to load.
 */
export async function openEditorTab(paneId: string, filename: string) {
    GetPane(paneId)

  // Load the file's content
  const content = await loadFile(filename);
  if (content === null) {
    return;
  }
  let tmp = document.createElement("div")
  tmp.innerHTML = content
  let realcontent = await newEditor(content, tmp).dom
  
  // Create the tab in the UI
  const tab = createTab( {paneId:paneId, tabId:shortUUID(4).toString(), title:filename, contentEl:realcontent, isEditor:true});
  // Activate the tab
  switchToTab(paneId, tab.id);

}

function fixAllTabs(){
  for (const [tabId, tab] of allTabs.entries()) {

    tab.contentEl.dataset.id = tab.id

    let newtab = {
      id: tab.id,
      title: tab.title,
      contentEl: tab.contentEl,
      isEditor: tab.isEditor
    }
    allTabs.set(tabId, newtab)
  }
}

function getContentWithId(searchId:string): HTMLElement{
  log.debug("Looking for searchID: ", searchId)
  for (const [tabId, tab] of allTabs.entries()) {
    log.debug("Tab Info:", { id: tab.id, title: tab.title, contentEl: tab.contentEl, contentElId: tab.contentEl?.dataset?.id });

    if (searchId == tab.id) {
      log.warn("Found contentEL: ", tab.contentEl)
      return tab.contentEl
    }
  }
}