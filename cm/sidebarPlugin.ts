import { ViewPlugin, ViewUpdate } from "npm:@codemirror/view";
import { getApp } from "../common/app.ts";

export const sidebarUpdatePlugin = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (update.docChanged) {
        const { sidebar } = getApp();
        sidebar?.scheduleUpdate();
      }
    }
  }
);