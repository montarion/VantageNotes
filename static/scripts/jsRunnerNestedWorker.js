// jsRunnerNestedWorker.js

const callbacks = new Map();
let nextCallbackId = 0;

function askMainThread(type, params = {}) {
  const id = nextCallbackId++;
  

  return new Promise((resolve) => {
    callbacks.set(id, resolve);
    self.postMessage({ type, callbackId: id, ...params }); // forward params too
  });
}

self.onmessage = async (e) => {
  const data = e.data;
  //console.debug("[Nested] onmessage received:", data);

  // 🔹 Handle responses from main thread
  if (data.callbackId !== undefined && callbacks.has(data.callbackId)) {
    
    const resolve = callbacks.get(data.callbackId);
    callbacks.delete(data.callbackId);
    resolve(data.value);
    return;
  }

  // 🔹 Otherwise, it's a normal "run this code" message
  const { code, runId } = data;
  //console.debug(`[Nested] Starting execution for runId=${runId}`);

  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    const msg = args.join(" ");
    logs.push(msg);
    originalLog("[Nested][userlog]", ...args);
  };

  // Define a safe API surface
  const api = {
    now: () => {
      const now = new Date().toISOString();
      //console.debug(`[Nested][api.now] returning ${now}`);
      return now;
    },
    reverse: (str) => {
      const rev = String(str).split("").reverse().join("");
      //console.debug(`[Nested][api.reverse] input="${str}", output="${rev}"`);
      return rev;
    },
    render: (html) => {
      let out;
      if (typeof html === "string") {
        out = html;
      } else {
        try {
          out = JSON.stringify(html, null, 4); // pretty JSON for objects/arrays
        } catch {
          out = String(html); // fallback if circular
        }
      }
      
      self.postMessage({ type: "render", html: out, runId });
    },
    async getCurrentFile() {
      //console.debug("[Nested][api.getCurrentFile] requesting from main thread");
      const val = await askMainThread("getCurrentFile");
      //console.warn("[Nested][api.getCurrentFile] got response:", val);
      return val;
    },
    async getFile(filename) {
      const val = await askMainThread("getFile", { filename });
      //console.warn("[Nested][api.getFile()] got response:", val);
      return val;
    },
    async getText(filename) {
      const val = await askMainThread("getText", { filename });
      //console.warn("[Nested][api.getText()] got response:", val);
      return val;
    },
    log: (...args) => {
      const msg = args.join(" ");
      logs.push(msg);
      //console.debug(`[Nested][api.log] ${msg}`);
      self.postMessage({ type: "log", message: msg, runId });
    },
  };

  try {
    //console.debug("[Nested] Executing user code...");
    // Wrap in async to support `await` in user code
    const fn = new Function("api", `"use strict"; return (async () => { ${code} })()`);
    const result = await fn(api);

    //console.debug("[Nested] Execution finished successfully:", result);
    self.postMessage({ type: "done", success: true, result, logs, runId });
  } catch (err) {
    //console.error("[Nested] Execution failed:", err);
    self.postMessage({ type: "done", success: false, error: String(err), logs, runId });
  } finally {
    //console.debug("[Nested] Cleaning up, restoring //console.log");
    //console.log = originalLog;
  }
};
