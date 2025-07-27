// autosave.ts
import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { showSaveStatus } from "../common/topbar.ts";
import { Logger } from '../common/logger.ts';
import { getActiveTab } from "../common/tabs.ts";
import { transclusionActiveField } from "./transclusions.ts";
import { loadFile } from "../common/navigation.ts";
import { getDocumentMode, getActiveDocId } from "./collaboration.ts";

const log = new Logger({ namespace: 'Autosave', minLevel: 'debug' });

function createAutoSavePlugin(saveCallback: (content: string) => void, delay = 1000) {
  return ViewPlugin.fromClass(
    class {
      view;
      timeout: number | null = null;

      constructor(view) {
        this.view = view;
      }

      update(update: ViewUpdate) {
        if (getDocumentMode(getActiveDocId()) != "single") {
          return; // not doing anything with autosave 
        }
        log.debug("Only one in document, running autosave")
        const isTransclusionActive = update.state.field(transclusionActiveField, false);
        if (!Object.keys(localStorage).includes("ActiveTab")){
          return
        }
        const filename = getActiveTab()?.title;
        if (!filename){
          log.warn("no current tab found")
          return
        }
        if (isTransclusionActive) {
          log.debug(`⏸️ Autosave skipped for main file '${filename}': transclusion in progress`);
          return;
        }

        if (update.docChanged) {
          if (this.timeout) clearTimeout(this.timeout);

          showSaveStatus("unsaved");

          this.timeout = window.setTimeout(() => {
            saveCallback(update.state.doc.toString());
            this.timeout = null;
          }, delay);
        }
      }

      destroy() {
        if (this.timeout) clearTimeout(this.timeout);
      }
    }
  );
}

export { createAutoSavePlugin };
