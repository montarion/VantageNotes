import { 
  fetchFileTree,
  generateNavigation, 
  getInitialFileFromURL,
  saveFile,
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
import { getPane } from "./pane.ts";
import { getMetadata, syncMetadataFromServer } from "./metadata.ts";
import { LOADIPHLPAPI } from "dns";

const log = new Logger({ namespace: 'Main', minLevel: 'debug' });

//Logging.enableNamespace("Tabs")
// Enable all logging for now
Logging.enableAll();

//eventBus.on("checkboxToggled", ({ lineNumber, checked, lineText }) => {
//  log.info(`Checkbox toggled on line ${lineNumber}. Checked: ${checked}`);
//});

eventBus.on("toggleCheckboxInFile", async ({ filename, lineNumber, newState }) => {
  try {
    log.debug("Target file:", filename);

    // Fetch metadata including file text
    const fileContent = await getMetadata(filename, true); // 'true' means get fresh from server
    if (!fileContent?.text) {
      log.warn("No file content found for", filename);
      return;
    }

    const fileLines = fileContent.text.split("\n");

    // Get the line in question (lineNumber is 1-based)
    let line = fileLines[lineNumber - 1];
    log.debug(`Line ${lineNumber}:`, line);

    // Match the checkbox pattern "[ ]" or "[x]"
    const match = line.match(/\[([ xX])\]/);
    if (!match || match.index === undefined) {
      log.warn("No checkbox found on line", lineNumber);
      return;
    }

    const checkboxPos = match.index + 1; // inside the brackets
    const newChar = newState ? "x" : " "; // toggle

    // Replace the character in the line
    line = line.slice(0, checkboxPos) + newChar + line.slice(checkboxPos + 1);
    fileLines[lineNumber - 1] = line;

    log.debug("Updated line:", line);

    // Reconstruct the full file content
    const newFileContent = fileLines.join("\n");

    
    // e.g., await saveFile(filename, newFileContent);
    log.debug("Updated file content ready for saving");
    await saveFile(newFileContent, filename)
    await getMetadata(filename, true)

  } catch (err) {
    log.error("Failed to toggle checkbox:", err);
  }
});
//
//eventBus.on("pageMetadataUpdated", (metadata) => {
//  log.info("Page metadata:", metadata);
//});


(async () => {
  await initTabs();
  // get metadata
  await syncMetadataFromServer()
  log.debug("before connectsocket")
  //await connectSocket()
  



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
    getPane(newpaneId)
    openEditorTab({paneId:"main", filename:"todo"}); // or create a default home tab if needed
  }
})();
