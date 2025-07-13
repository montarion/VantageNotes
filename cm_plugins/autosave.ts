// autosave.ts
import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { showSaveStatus } from "../common/topbar.ts";
import { Logger } from '../common/logger.ts';
import { getCurrentTab } from "../common/tabs.ts";
import { transclusionActiveField } from "./transclusions.ts";
import { loadFile } from "../common/navigation.ts";

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
        const isTransclusionActive = update.state.field(transclusionActiveField, false);
        log.debug(Object.keys(localStorage).includes("CurrentTab"))
        log.debug("current tab", getCurrentTab())
        if (!Object.keys(localStorage).includes("CurrentTab")){
          return
        }
        const filename = getCurrentTab()?.title;
        if (!filename){
          log.warn("no current tab found")
          return
        }
        if (isTransclusionActive) {
          log.debug(`⏸️ Autosave skipped for main file '${filename}': transclusion in progress`);
          return;
        }

        if (update.docChanged) {
          log.info(`🔥 AUTOSAVE triggered for main file: '${filename}'`);
          if (this.timeout) clearTimeout(this.timeout);

          showSaveStatus("unsaved");

          this.timeout = window.setTimeout(() => {
            log.info(`💾 Saving main file '${filename}' after ${delay}ms delay`);
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
