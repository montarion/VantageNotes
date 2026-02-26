// collab_ws.ts
import * as Y from "npm:yjs";
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { setupWSConnection } from "./y-websocket-server/src/utils.js";
import { join, resolve } from "https://deno.land/std/path/mod.ts";
import { exists, ensureFile } from "https://deno.land/std/fs/mod.ts";
import { Logger } from "./common/logger.ts";
import { MetadataExtractor } from "./metadata.ts";

const log = new Logger("crdts");

const NOTES_DIR = resolve("static/notes/");
const docs = new Map<string, Y.Doc>();
const watchers = new Map<string, Deno.FsWatcher>();
let store: MetadataStore | undefined;

/**
 * Get or create a Y.Doc for a note.
 */
async function getDoc(filename: string): Promise<Y.Doc> {
  if (!docs.has(filename)) {
    const ydoc = new Y.Doc();
    filename = decodeURI(filename)
    const filePath = join(NOTES_DIR, filename.endsWith(".md") ? filename : filename + ".md");

    // Load file if exists
    if (await exists(filePath)) {
      try {
        const content = await Deno.readTextFile(filePath);
        ydoc.getText(filename).insert(0, content);
        log.debug(`Loaded ${filename} into Y.Doc (length=${content.length})`);

        // Update metadata on initial load
        if (store) {
          const meta = MetadataExtractor.extractMetadata(content);
          store.updateDoc(filename, content, meta);
        }
      } catch (e) {
        log.error(`Failed to load ${filePath}: ${e}`);
      }
    }

    // Save updates to file and metadata
    ydoc.on("update", async () => {
      const text = ydoc.getText(filename).toString();
      await ensureFile(filePath);
      await Deno.writeTextFile(filePath, text);

      // Update metadata store
      if (store) {
        const meta = MetadataExtractor.extractMetadata(text);
        store.updateDoc(filename, text, meta);
      }

      log.debug(`Persisted ${filename} to disk (length=${text.length})`);
    });

    // Watch underlying file for external changes
    watchFile(filename, filePath, ydoc);

    docs.set(filename, ydoc);
  }
  return docs.get(filename)!;
}

/**
 * Watch a file for external changes and update the Y.Doc
 */
function watchFile(filename: string, path: string, ydoc: Y.Doc) {
  if (watchers.has(filename)) {
    watchers.get(filename)!.close(); // stop old watcher
  }

  const watcher = Deno.watchFs(path);
  watchers.set(filename, watcher);

  (async () => {
    try {
      for await (const event of watcher) {
        if (!event.kind.includes("modify")) continue;

        const newContent = await Deno.readTextFile(path).catch(() => "");
        const ytext = ydoc.getText(filename);

        if (ytext.toString() !== newContent) {
          ytext.delete(0, ytext.length);
          ytext.insert(0, newContent);
          log.debug(`External update applied to ${filename} from disk`);

          // Update metadata store on external change
          if (store) {
            const meta = MetadataExtractor.extractMetadata(newContent);
            store.updateDoc(filename, newContent, meta);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        log.error(`File watcher error for ${filename}: ${e}`);
      }
      watcher.close();
    }
  })();
}

// ---------------------- Yjs WebSocket server ----------------------
export async function startYjsServer(
  host = "0.0.0.0",
  port = 11625,
  metadataStore?: MetadataStore
) {
  store = metadataStore;

  serve(async (req) => {
    const upgrade = req.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      const url = new URL(req.url, "http://localhost");
      const pathParts = url.pathname.split("/").filter(Boolean);

      if (pathParts[0] !== "ws" || !pathParts[1]) {
        socket.close(1008, "Invalid path. Use /ws/[filename]");
        return response;
      }

      const filename = pathParts.slice(1).join("/");
      const ydoc = await getDoc(filename);

      // bind the ws to the Y.Doc
      setupWSConnection(socket, { docName: filename, gc: true, doc: ydoc });

      return response;
    }

    return new Response("Yjs WebSocket server", { status: 200 });
  }, { port });

  log.debug(`Yjs WebSocket server running on ws://${host}:${port}/ws/[filename]`);
}
