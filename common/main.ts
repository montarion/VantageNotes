import { 
  fetchFileTree,
  generateNavigation, 
  getInitialFileFromURL,
  toggleSidebar, 
} from "./navigation.ts";

import { 
  eventBus 
} from "./events.ts";

import { 
  hasOpenTabs, 
  initTabs, 
  openEditorTab,   
} from "./tabs.ts";

import { setupSearchHandler } from "./search.ts";
import { Logger, Logging } from './logger.ts';
import { shortUUID } from "./pluginhelpers.ts";
import { GetPane } from "./pane.ts";

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

  // Generate navigation pane/tab
  await generateNavigation();

  // Open initial file in main pane if any
  const initialFile = getInitialFileFromURL();

  
  if (initialFile) {
    await openEditorTab({paneId:"main", filename:initialFile});
  } else if (!hasOpenTabs("main")) {
    // Optionally open a default file or welcome tab
    let newpaneId = "main"
    GetPane(newpaneId)
    openEditorTab({paneId:"main", filename:"todo"}); // or create a default home tab if needed
  }
})();
