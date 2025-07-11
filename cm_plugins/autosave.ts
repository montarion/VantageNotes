// autosave.ts
import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { showSaveStatus } from "../common/topbar.ts";
import { Logger } from '../common/logger.ts';
import { getCurrentTab } from "../common/tabs.ts";
import { transclusionActiveField } from "./transclusions.ts";

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
        log.debug("updating")
        const isTransclusionActive = update.state.field(transclusionActiveField, false);
        const filename = getCurrentTab().title;

        log.debug(filename)
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
