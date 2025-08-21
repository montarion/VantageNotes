//pane.ts

import { newEditor } from "./editor.ts";
import { fetchFileTree, loadFile } from "./navigation.ts";
import { updateBreadcrumb, showSaveStatus } from "./topbar.ts";
import { showMetadataPanel } from '../common/metadata.ts';
import { Logger } from "./logger.ts";
const log = new Logger({ namespace: "Pane", minLevel: "debug" });
import { shortUUID } from "./pluginhelpers.ts";
import { Tab, renderTabsUI, setupDragAndDrop, switchToTab } from "./tabs.ts";



export type Pane = {
    id: string;
    tabs: Map<string, Tab>;
    activeTabId: string;
    tabBarEl: HTMLElement;
    contentEl: HTMLElement;
    editorInstance?: ReturnType<typeof newEditor>; // Or whatever your editor type is
  };

const panes = new Map<string, Pane>();
const allDragZones = new Set<HTMLDivElement>();

/**
 * Creates a new pane container with tab-bar and tab-content elements.
 * @param {string} [paneId] Optional pane ID. If omitted, a new unique ID is generated.
 * @returns {Pane} The newly created pane object.
 */
export function getPane(paneId?: string): Pane {
    if (!paneId) {
      paneId = `pane_${shortUUID()}`;
    }
  
    if (panes.has(paneId)) {
      return panes.get(paneId)!;
    }
  
    const paneEl = document.createElement("div");
    paneEl.className = "pane";
    paneEl.dataset.pane = paneId;
  
    const tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    tabBar.dataset.pane = paneId;
  
    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.dataset.pane = paneId;
  
    

    paneEl.append(tabBar, tabContent);
    document.querySelector(".app")?.append(paneEl);

    const editor = newEditor(tabContent);
    
  
    const paneObj: Pane = {
      id: paneId,
      tabs: new Map(),
      activeTabId: "",
      tabBarEl: tabBar,
      contentEl: tabContent,
      editorInstance: editor
    };
  
  
    panes.set(paneId, paneObj);
    registerPaneZones(paneEl, paneObj.id);

    setupDragAndDrop(tabBar, paneId);
    renderTabsUI(paneId)
    return paneObj;
  }
  
  
  
export function getPaneContent(paneId: string): HTMLElement{
    let pane = getPane(paneId)
    return pane.contentEl
}

export function getActivePane(): string{
  let id = localStorage.getItem("CurrentPane")
  return id
}

export function setActivePane(paneId: string){
  localStorage.setItem("CurrentPane", paneId)
  // remove active class from all panes
  document.querySelectorAll('.pane').forEach(el => {
    el.classList.remove('active');
  });
  // find active pane, and add active class
  document.querySelector(`.pane[data-pane="${paneId}"]`)?.classList.add("active")
}

export function removePane(paneId: string) {
  const pane = panes.get(paneId);
  if (!pane) {
    log.warn(`No pane found with ID ${paneId}`);
    return;
  }

  // Attempt to remove the pane's DOM element
  const el = document.querySelector(`.pane[data-pane="${paneId}"]`);
  if (el) {
    el.remove();
    log.debug(`Removed pane DOM element for ${paneId}`);
  } else {
    log.warn(`Could not find pane DOM element for ${paneId}`);
  }

  // Remove related drag zones
  for (const zone of Array.from(allDragZones)) {
    if (zone.dataset.paneId === paneId) {
      zone.remove();
      allDragZones.delete(zone);
    }
  }

  // Remove pane from map
  panes.delete(paneId);

  const remainingPaneIds = [...panes.keys()];

  // If it's the active pane, clear or switch
  if (getActivePane() === paneId) {
    if (remainingPaneIds.length > 0) {
      setActivePane(remainingPaneIds[0]);
    } else {
      localStorage.removeItem("CurrentPane");
    }
  }

  // 🆕 Create new pane if none remain
  if (remainingPaneIds.length === 0) {
    const newPane = getPane(); // this creates and registers a fresh one
    setActivePane(newPane.id);
    log.debug(`All panes removed — created new pane: ${newPane.id}`);
  }
  log.debug(`Pane ${paneId} fully removed.`);
}


function setupPaneDragZones(paneEl: HTMLElement, paneId: string) {
    if (paneEl.querySelector(".drag-zone")) return;

    const sides = ["right"] as const;
    log.debug("Setting up pane drag zones!")
    const zones: HTMLDivElement[] = [];

    for (const side of sides) {
      const zone = document.createElement("div");
      zone.classList.add("drag-zone", `drag-zone-${side}`);
      zone.dataset.paneId = paneId;
      zone.dataset.side = side;
  
      // Drag-over styling
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("drag-zone-hover");
      });
  
      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-zone-hover");
      });
  
      // Handle drop
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-zone-hover");
  
        const data = e.dataTransfer?.getData("text/plain");
        log.warn(`Dropped tab!`, data)
        if (!data) return;
  
        const { tabId, fromPane } = JSON.parse(data);
        const side = zone.dataset.side!;
        const toPane = getPane().id;
  
        handleTabDropToNewPane(fromPane, tabId, toPane);
      });
  
      paneEl.appendChild(zone);
      zones.push(zone)
    }
    return zones
  }
  
  export function handleTabDropToNewPane(fromPaneId: string, tabId: string, toPaneId: string) {
    log.debug("INSIDE HANDLETABDROPTONEWPANE")
    const fromPane = getPane(fromPaneId);
  
    // Don't do anything if dropping back into same pane
    if (fromPaneId === toPaneId && fromPane.tabs.has(tabId)) return;
    const toPane = getPane(toPaneId);

    // 1. Create new pane
    const newPane = toPane; 
  
    // 2. Position new pane relative to `toPane`, based on `side`
    //splitPane(toPane, newPane, side); // You’ll need to implement this
  
    // 3. Move tab to new pane
    log.debug("Tabs in old pane before removal", Array.from(fromPane.tabs.keys()))

    const tab = fromPane.tabs.get(tabId);
    if (tab) {
      fromPane.tabs.delete(tabId);
      newPane.tabs.set(tabId, tab);
      newPane.activeTabId = tabId;
      // actually switch
      switchToTab(newPane.id, tabId)
    }

    log.debug("Tabs in old pane after removal", Array.from(fromPane.tabs.keys()))
    // check old pane
    const remainingTabs = Array.from(fromPane.tabs.keys());
    if (remainingTabs.length > 0) {
      // do re-render old pane
      renderTabsUI(fromPaneId);
    } else { // remove old pane

      removePane(fromPane.id)
    }
  
    
    // 4. Re-render pane
    renderTabsUI(newPane.id);

  }

  function registerPaneZones(paneEl: HTMLElement, paneId: string) {
    const zones = setupPaneDragZones(paneEl, paneId);
    zones.forEach(zone => allDragZones.add(zone));
  }
  
  document.addEventListener("dragstart", () => {
    allDragZones.forEach(zone => {
      zone.style.display = "block";
    });
  });
  
  document.addEventListener("dragend", () => {
    allDragZones.forEach(zone => {
      zone.style.display = "none";
      zone.classList.remove("drag-zone-hover");
    });
  });

  document.addEventListener("drop", () => {
    allDragZones.forEach(zone => {
      zone.style.display = "none";
      zone.classList.remove("drag-zone-hover");
    });
  });
  
export function getPaneByDocID(docID: string): Pane | undefined {
  for (const pane of panes.values()) {
    for (const tab of pane.tabs.values()) {
      if (tab.title === docID) {
        return pane;
      }
    }
  }
  return undefined;
}