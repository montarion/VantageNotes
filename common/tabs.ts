//tabs.ts

import { fetchFileTree, loadFile } from "./navigation.ts";
import { updateBreadcrumb, showSaveStatus } from "./topbar.ts";
import { showMetadataPanel, PageMetadata, getMetadata } from '../common/metadata.ts';
import { Logger } from "./logger.ts";
import { shortUUID } from "./pluginhelpers.ts";
import { getPane, getActivePane, getPaneContent, handleTabDropToNewPane, removePane, setActivePane } from "./pane.ts";
import { CMEditor, newEditor } from "./editor.ts";

const log = new Logger({ namespace: "Tabs", minLevel: "debug" });

const STORAGE_KEY = "openTabs";
const STORAGE_ACTIVE = "ActiveTab";

export type Tab = {
  id: string;
  title: string;
  contentEl: HTMLElement;
  metadata: PageMetadata;
  isEditor?: boolean;
};

type TabCreation = {
  paneId?: string;
  tabId?: string;
  title: string;
  contentEl: HTMLElement;
  isEditor?: boolean;
}
const tabsByPane = new Map<string, Map<string, Tab>>();
const allTabs = new Map<string, Tab>();

// Store tab bars and content containers per pane
const contentContainers = new Map<string, HTMLElement>();
let spinner: HTMLElement | null = null;

export async function initTabs() {
  log.info("Initializing tabs...");
  getPane("main")

  

  // Restore saved tabs
  //await restoreTabs()
  log.debug("initTabs finished")
}


export function createTab({
  paneId = "pane2",
  tabId = shortUUID(),
  title,
  contentEl,
  isEditor = true,
}: TabCreation): Tab {
  const pane = getPane(paneId);

  // Don't recreate if tab already exists
  if (pane.tabs.has(tabId)) {
    switchToTab(paneId, tabId);
    return pane.tabs.get(tabId)!;
  }
  let metadata: PageMetadata;
  // Attach the tab content element to the pane content container
  const paneContentContainer = getPaneContent(paneId) //document.getElementById(`${paneId}-content`);
  if (!paneContentContainer) {
    throw new Error(`Missing content container for pane ${paneId}`);
  }

  contentEl.dataset.id = tabId;
  //contentEl.classList.add("tab-content");

  // ⬅️ This ensures the element is in the DOM before CodeMirror initializes
  //paneContentContainer.appendChild(contentEl);

  let tabobj = { id: tabId, title, contentEl, isEditor }
  if (!isEditor){
    paneContentContainer.innerHTML = ""
    paneContentContainer.append(contentEl)
  } else {
    // get metadata
    metadata = getMetadata(contentEl.textContent);
    tabobj["metadata"] = metadata
    //pane.editorInstance?.setValue(contentEl.textContent)
  }
  //let editorInstance = newEditor(paneContentContainer)
  const tab: Tab = tabobj;
  // Register the tab
  allTabs.set(tabId, tab);
  pane.tabs.set(tabId, tab);

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
  const pane = getPane(paneId);
  const tab = pane.tabs.get(tabId);
  log.debug("switching to tab:", tab.title)

  if (!tab) return;

  pane.activeTabId = tabId;

  setActiveTab(tab.id)

  if (tab.isEditor) {
    //pane.editorInstance?.setValue(tab.contentEl.textContent)
    pane.editorInstance?.bindCollaboration(tab.title);
    //pane.editorInstance?.setValue("fireflies atnight")
    
  } else {
    // For non-editor tabs, show the tab content
    pane.contentEl.innerHTML = "";
    pane.contentEl.append(tab.contentEl);
  }
  //setContent(paneId, tab.id)
  setActivePane(paneId)
  //updateBreadcrumb(tab.title)
  showMetadataPanel(tab.title)
  renderTabsUI(paneId);


  
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
function closeTab(paneId: string, tabId: string) {
  log.debug("inside closetab")
  const pane = getPane(paneId)
  const tabBar = pane.tabBarEl
  const paneTabs = pane.tabs;
  const contentContainer = pane.contentEl
  log.debug("tabBar", tabBar)
  log.debug("panetabs", paneTabs)
  log.debug("allTabs:", allTabs)
  if (!paneTabs || !allTabs || !tabBar) return;

  // Remove from in-memory maps
  let Tabs = pane.tabs.get(tabId);

  paneTabs?.delete(tabId);
  allTabs.delete(tabId)
  
  log.debug("Removing tab: ", tabId)

  // Remove tab from DOM
  const tabButton = tabBar.querySelector(`[data-tab-id="${tabId}"]`);
  if (tabButton) tabButton.remove();


  // If the closed tab was active
  const wasActive = pane.activeTabId === tabId;
  if (wasActive) {
    //pane.editorInstance?.setValue("[new tab menu]");

    // Try activating another tab (most recently added one)
    const remainingTabs = Array.from(paneTabs.keys());
    if (remainingTabs.length > 0) {
      const newActiveId = remainingTabs[remainingTabs.length - 1];

      switchToTab(paneId, newActiveId)
      
       // Update the UI
      renderTabsUI(paneId); // would recreate pane through getPane, so can't be called last
    } else { // pane is now empty
      removePane(paneId) 
    }
  } else {
    // check if there are remaining tabs
    const remainingTabs = Array.from(paneTabs.keys());
    if (remainingTabs.length > 0) {
      // Update the UI
      renderTabsUI(paneId);
    } else {
      // pane is now empty
      removePane(paneId) 
    }
  }

  

 
}



/**
 * Renders the tab UI for a given pane.
 * @param paneId - The ID of the pane to render tabs for.
 */
export function renderTabsUI(paneId: string) {
  const pane = getPane(paneId);
  let tabBar = pane.tabBarEl;
  tabBar.innerHTML = "";
  for (const [tabId, tab] of pane.tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.dataset.id = tabId;
    tabEl.draggable = true
    const filename = tab.title

    // Drag handlers for the individual tab
    tabEl.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData("text/plain", JSON.stringify({
        tabId,
        fromPane: paneId,
        filename: filename
      }));
      e.dataTransfer?.setDragImage(tabEl, 0, 0); // Optional: cleaner drag UX
    });

    tabEl.addEventListener("dragover", (e) => {
      e.preventDefault(); // Necessary to allow drop
    });

    tabEl.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer?.getData("text/plain");
      if (!data) return;

      const { tabId: draggedId, fromPane } = JSON.parse(data);
      reorderTabs(fromPane, draggedId, paneId, tabId); // 👈 drop before this tab
    });
    const titleSpan = document.createElement("span");
    titleSpan.textContent = tab.title;
    titleSpan.className = "tab-title";
    titleSpan.addEventListener("click", () => switchToTab(paneId, tabId));
    
    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("mousedown", (e) => {
      //e.stopPropagation(); // Prevent tab switching on close

      closeTab(paneId, tabId); // You can also use closeTab if preferred
    });

    tabEl.appendChild(titleSpan);
    tabEl.appendChild(closeBtn);

    if (pane.activeTabId === tabId) {
      tabEl.classList.add("active");
    }
    tabBar.append(tabEl);
  }
}



async function restoreTabs() {
  log.debug("Trying to restore tabs!")

  // After restoring, you might want to re-render your tabs UI for all panes
  //tabsByPane.forEach((_tabs, paneId) => {
  //  renderTabsUI(paneId);
  //});
}

export function reorderTabs(
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


function updateTabContentDisplay(paneId: string, tabContent: HTMLElement) {
  const Pane = getPane(paneId)

  const activeId = Pane.activeTabId;
  const container = Pane.contentEl; //document.querySelector(`.tab-content[data-pane="${paneId}"]`)

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
export function setContent(paneId: string, tabId:string){
  let pane = getPane(paneId)
  let tab = allTabs.get(tabId)
  if (tab?.isEditor){
    //pane.editorInstance?.setValue(tab.contentEl.textContent || "")
    //newEditor(pane.contentEl, {collabMode:true, initialDoc: tab.contentEl.textContent})
  }
  
  
}

export function removeTab(paneId: string, tabId: string) {
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
  updateTabContentDisplay(paneId, getPaneContent(paneId));
  saveTabs();
}



export function getActiveTab(): Tab | null {
  return allTabs.get(localStorage.getItem(STORAGE_ACTIVE)) || null
}
function setActiveTab(id: string){
  localStorage.setItem(STORAGE_ACTIVE, id)
  let tab = allTabs.get(id)
  history.pushState({}, '', '/' + encodeURI(tab?.title ?? ''));
  const filename = tab?.title ?? 'Untitled Note';
  document.title = `${filename} – VantageNotes`;
}


export function showLoading(paneId: string, visible: boolean) {
  if (!spinner) return;
  spinner.style.display = visible ? "inline-block" : "none";
  const contentContainer = contentContainers.get(paneId);
  if (!contentContainer) return;
  contentContainer.style.display = visible ? "none" : "block";
}



export function setupDragAndDrop(tabBar: HTMLElement, paneId: string) {
  tabBar.querySelectorAll(".tab").forEach((tabEl) => {
    const tabId = tabEl.getAttribute("data-id");
    const tab = allTabs.get(tabId)
    if (!tabId) return;

    tabEl.setAttribute("draggable", "true");

    tabEl.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData(
        "application/json",
        JSON.stringify({ tabId, fromPane: paneId, filename:tab?.title })
      );
      e.dataTransfer!.effectAllowed = "move";
    });
  });

  tabBar.addEventListener("dragover", (e) => {
    e.preventDefault();
    tabBar.classList.add('drag-over');
    e.dataTransfer!.dropEffect = "move";
  });

  tabBar.addEventListener("dragleave", (e) => {
    e.preventDefault();
    tabBar.classList.remove('drag-over');
  });
  tabBar.addEventListener("drop", (e: DragEvent) => {
    tabBar.classList.remove('drag-over');
    log.warn("DROPPED TAB ON TABBAR")
    e.preventDefault();
    

    const data = e.dataTransfer?.getData("text/plain");
    log.warn("tabdata:", data)
    if (!data) return;

    const { tabId: draggedId, fromPane } = JSON.parse(data);

    // Determine where the tab is dropped — before which tab
    const targetTab = (e.target as HTMLElement).closest(".tab") as HTMLElement;
    const targetId = targetTab?.dataset.id || null;
    
  
    handleTabDropToNewPane(fromPane, draggedId, paneId);
    //reorderTabs(fromPane, draggedId, paneId, targetId);
  });
}



/**
 * Opens an editor tab in the specified pane with the given file.
 * Creates the tab if it doesn't exist and loads file content into the editor.
 *
 * @param paneId - The pane (left, right, etc.) where the tab should be opened.
 * @param filename - The name of the file to load.
 */
export async function openEditorTab({paneId, filename}) {
  if (!paneId){
    paneId = getActivePane()
  }
  
  const pane = getPane(paneId);

  // Load the file's content
  const content = await loadFile(filename);
  
  // Create a container for CodeMirror
  const contentEl = document.createElement("div");
  contentEl.style.height = "100%";
  contentEl.style.width = "100%";
  contentEl.classList.add("editor-container");
  contentEl.textContent = content || ""

  // Create the tab in the UI (this appends contentEl to the DOM)
  const tab = createTab({
    paneId,
    tabId: shortUUID(4).toString(),
    title: filename,
    contentEl,
    isEditor: true,
  });




  // Activate the tab
  switchToTab(paneId, tab.id);
}
