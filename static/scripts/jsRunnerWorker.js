// jsRunnerWorker.js

// Track nested workers by runId
const nestedWorkers = new Map();
// Track callbackId → runId mappings so we only return to the correct worker
const callbackToRun = new Map();

self.onmessage = (e) => {
  const { runId, callbackId } = e.data;

  // 🔹 Case 1: This is a callback response from the main thread
  if (callbackId !== undefined) {
    const targetRunId = callbackToRun.get(callbackId);
    if (targetRunId !== undefined) {
      const worker = nestedWorkers.get(targetRunId);
      if (worker) {
        
        worker.postMessage({ ...e.data, runId: targetRunId });
      } else {
        console.warn(
          `[Worker] No nested worker found for runId=${targetRunId}, dropping callbackId=${callbackId}`
        );
      }
      callbackToRun.delete(callbackId);
    } else {
      console.warn(
        `[Worker] Unknown callbackId=${callbackId}, no mapping found`
      );
    }
    return;
  }

  // 🔹 Case 2: New run request
  const nestedWorker = new Worker("/static/scripts/jsRunnerNestedWorker.js");
  nestedWorkers.set(runId, nestedWorker);

  //console.debug(`[Worker] Created nested worker for runId=${runId}`);

  const timer = setTimeout(() => {
    //console.warn(`[Worker] Timeout hit for runId=${runId}`);
    cleanup();
    self.postMessage({
      type: "done",
      success: false,
      error: `Execution timed out for code`,
      logs: [],
      runId
    });
  }, e.data.timeoutMs);

  function cleanup() {
    clearTimeout(timer);
    try {
      nestedWorker.terminate();
    } catch (err) {
      //console.error(`[Worker] Error terminating nested worker runId=${runId}`, err);
    }
    nestedWorkers.delete(runId);
  }

  nestedWorker.onmessage = (event) => {
    const msg = event.data;

    // 🔹 Nested worker is asking main thread for something
    if (msg.callbackId !== undefined && msg.type !== "done") {
      
      callbackToRun.set(msg.callbackId, runId);
      self.postMessage({ ...msg, runId });
      return;
    }

    // 🔹 Forward everything else, including logs and renders
    
    self.postMessage({ ...msg, runId: msg.runId ?? runId });

    if (msg.type === "done" || msg.success === false) {
      cleanup();
    }
  };

  // 🔹 Forward the full message (code + any extra parameters) to nested worker
  nestedWorker.postMessage({ ...e.data });
};
