import { 
  fetchFileTree,
  generateNavigation, 
  getInitialFileFromURL, 
  setupNavigationTab 
} from "./navigation.ts";

import { 
  eventBus 
} from "./events.ts";

import { 
  createTab, 
  hasOpenTabs, 
  initTabs, 
  openEditorTab, 
  setupContainerDragAndDrop, 
  switchToTab, 
  getPane,
  GetPane
} from "./tabs.ts";

import { setupSearchHandler } from "./search.ts";
import { Logger, Logging } from './logger.ts';
import { shortUUID } from "./pluginhelpers.ts";

const log = new Logger({ namespace: 'Main', minLevel: 'debug' });

//Logging.enableNamespace("Tabs")
// Enable all logging for now
Logging.enableAll();

//eventBus.on("checkboxToggled", ({ lineNumber, checked, lineText }) => {
//  log.info(`Checkbox toggled on line ${lineNumber}. Checked: ${checked}`);
//});
//
//eventBus.on("pageMetadataUpdated", (metadata) => {
//  log.info("Page metadata:", metadata);
//});

(async () => {
  await initTabs();
  



  // Setup drag/drop for content container in main pane
  //setupContainerDragAndDrop("main");

  // Generate navigation pane/tab
  await generateNavigation();

  // Open initial file in main pane if any
  const initialFile = getInitialFileFromURL();

  if (initialFile) {
    await openEditorTab("pane2", initialFile);
  } else if (!hasOpenTabs("pane2")) {
    // Optionally open a default file or welcome tab
    let newpaneId = shortUUID(4)
    GetPane(newpaneId)
    openEditorTab("pane2", "todo"); // or create a default home tab if needed
  }
})();
