import { ViewPlugin } from "npm:@codemirror/view";
import { Logger } from "../common/logger.ts";
import { applyHtmlOutputs, htmlOutputPerBlockPlugin, setOutput } from "./htmlOutputPlugin.ts";
import { CodeBlock } from "../common/metadata.ts";
import { getActiveTab } from "../common/tabs.ts";
import { getMetadata } from "../common/metadata.ts";
import { loadFile, saveFile } from "../common/navigation.ts";
import { foldLines } from "../common/editor.ts";

const log = new Logger({ namespace: "jsworker", minLevel: "debug" });

// Map of editor views → runner instances
export const runnerMap = new WeakMap();

let runIdCounter = 0;

const callbacks = new Map();
let callbackCounter = 0;

export function registerJsRunner(view: any, workerURL = "/static/scripts/jsRunnerWorker.js") {
  if (runnerMap.has(view)) {
    log.debug("Runner already registered for this view");
    return runnerMap.get(view);
  }

  const runner = {
    view,
    worker: new Worker(workerURL),

    runCode(codeOverride?: string, timeoutMs = 2000): Promise<string> {
      const code = codeOverride ?? this.view.state.doc.toString();
      return new Promise((resolve, reject) => {
        const onMessage = (e: MessageEvent) => {
          const data = e.data;
          if (data.type === "done") {
            if (data.success) resolve(data.result ?? "");
            else reject(data.error);
            this.worker.removeEventListener("message", onMessage);
          }
        };

        this.worker.addEventListener("message", onMessage);
        this.worker.postMessage({ code, timeoutMs });
      });
    },

    destroy() {
      this.worker.terminate();
      runnerMap.delete(view);
    }
  };

  runnerMap.set(view, runner);
  log.debug("JsRunner registered for view", view);
  return runner;
}


// --- updated runCode per block ---
export async function runCode(view: any, codeblock: CodeBlock, timeoutMs = 2000): Promise<string> {
  const runner = runnerMap.get(view);
  if (!runner) {
    console.warn("No jsRunner instance found for this view");
    return "";
  }

  const runId = ++runIdCounter;

  return new Promise((resolve, reject) => {
    const onMessage = async (e) => {
      const data = e.data;
    
      // Only handle messages for this run ID (if present)
      if (data.runId && data.runId !== runId) return;
    
      switch (data.type) {
        case "render":
          setOutput(view, { 
            fromLine: codeblock.fromLine, 
            toLine: codeblock.toLine, 
            html: data.html 
          });
          break;
    
        case "log":
          log.debug(typeof(data.message))
          console.log("[js log]", data.message);
          break;
    
        case "done":
          if (data.success) resolve(data.result ?? "");
          else reject(data.error);
          runner.worker.removeEventListener("message", onMessage);
          break;
    
        case "getCurrentFile":
          log.debug("getting current file metadata")
          var current = getMetadata(await loadFile(getActiveTab()?.title)); // todo: get text from editor instead of asking the server
          // 🔹 reply back with callbackId + value
          log.warn(`replying with callback id ${data.callbackId} and value: ${JSON.stringify(current)}`)
          runner.worker.postMessage({ callbackId: data.callbackId, value: current });
          break;

        case "getFile":
          var fileName = data.filename;
          var metadata = getMetadata(filename, await loadFile(fileName));
          runner.worker.postMessage({ callbackId: data.callbackId, value: metadata });
          break;

        case "getText":
          var fileName = data.filename;
          var fileContent = getMetadata(await loadFile(fileName));
          
          runner.worker.postMessage({ callbackId: data.callbackId, value: fileContent.text});
          break;
        case "setText":
          var filename = data.filename
          var res = await saveFile(data.text, filename)
          runner.worker.postMessage({ callbackId: data.callbackId, value: res});
        case "foldLines":
          log.warn("trying to fold lines!")
          //foldLines(data.from, data.to)
          break;
        default: // really what you'd want is to render everything that's returned at the end..
          runner.worker.postMessage({ callbackId: data.callbackId, value: `Unknown method: ${data.type}`});
      }
    };
    
    

    runner.worker.addEventListener("message", onMessage);

    // send code + runId so the worker can tag messages
    runner.worker.postMessage({ code: codeblock.code, runId, timeoutMs});
  });
}
