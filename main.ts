import { Application, Router, send, Context } from "jsr:@oak/oak";
import { ensureFile } from "jsr:@std/fs/ensure-file";
import { MetadataExtractor } from "./common/metadata.ts";
import { Logger } from "./common/logger.ts";
import { exists } from "https://deno.land/std/fs/mod.ts";
import { join, resolve } from "https://deno.land/std/path/mod.ts";
import { serveYjs } from "./yjs-deno-ws/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts"; // for env access
import { createMetadataIndexer } from "./common/metadataindexer.ts";
import { readdir, readFile } from "node:fs/promises";
import { createServerDB } from "./common/server-db.ts";

const log = new Logger("main");
const NOTES_DIR = resolve("static/notes");
const SPA_ROOT = "templates"; // points to the real folder
const SPA_PREFIX = "/";       // the URL prefix that triggers SPA fallbac

const app = new Application();
const router = new Router();

// ─── Build file tree ─────────────────────────────
async function buildFileTree(path: string): Promise<any[]> {
  const tree = [];
  for await (const entry of Deno.readDir(path)) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(path, entry.name);
    if (entry.isDirectory) {
      tree.push({
        name: entry.name,
        type: "folder",
        children: await buildFileTree(fullPath),
      });
    } else {
      const stat = await Deno.stat(fullPath);
      if (stat.size === 0) continue;
      tree.push({
        name: entry.name,
        type: "file",
      });
    }
  }
  return tree;
}

// ─── Cleanup empty notes ─────────────────────────
async function cleanupEmptyNotes(path: string = NOTES_DIR, thresholdSec = 10) {
  const now = Date.now() / 1000;
  for await (const entry of Deno.readDir(path)) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory) {
      await cleanupEmptyNotes(fullPath, thresholdSec);
      try {
        if ((await Deno.readDir(fullPath)).next().done) {
          await Deno.remove(fullPath);
          log.debug(`🗑️ Removed empty folder: ${fullPath}`);
        }
      } catch {}
    } else {
      try {
        const stat = await Deno.stat(fullPath);
        if (stat.size === 0 && (now - stat.mtime!.getTime() / 1000) > thresholdSec) {
          await Deno.remove(fullPath);
          log.debug(`🗑️ Removed empty file: ${fullPath}`);
        }
      } catch {}
    }
  }
}

// ─── Routes ─────────────────────────────
router.get("/api/notes", async (ctx) => {
  const tree = await buildFileTree(NOTES_DIR);
  ctx.response.body = tree;
});

// metadata endpoint (single + all)
router.get("/api/metadata/:filename?", async (ctx) => {
  const filename = ctx.params.filename;
  if (filename) {
    const filePath = join(NOTES_DIR, filename);
    if (!(await exists(filePath))) {
      ctx.response.status = 404;
      ctx.response.body = { error: `File not found: ${filename}` };
      return;
    }
    const text = await Deno.readTextFile(filePath);
    const metadata = MetadataExtractor.extractMetadata(text);
    ctx.response.body = metadata;
  } else {
    // all metadata: lazy load all notes
    const allMeta: Record<string, any> = {};
    for await (const entry of Deno.readDir(NOTES_DIR)) {
      if (!entry.isFile) continue;
      const text = await Deno.readTextFile(join(NOTES_DIR, entry.name));
      allMeta[entry.name] = MetadataExtractor.extractMetadata(text);
    }
    ctx.response.body = allMeta;
  }
});

// note read/write
router.get("/notes/:filename+", async (ctx) => {
  const filePath = join(NOTES_DIR, ctx.params.filename+".md");
  let fexists = await exists(filePath)
  if (!(await exists(filePath))) {
    await ensureFile(filePath);
    ctx.response.body = "";
    ctx.response.type = "text/markdown; charset=utf-8";
    return;
  }
  ctx.response.body = await Deno.readTextFile(filePath);
  ctx.response.type = "text/markdown; charset=utf-8";
});

router.post("/notes/:filename+", async (ctx) => {
  const body = await ctx.request.body({ type: "text" }).value;
  const filePath = decodeURI(join(NOTES_DIR, ctx.params.filename+".md"));
  await ensureFile(filePath);
  await Deno.writeTextFile(filePath, body);
  ctx.response.status = 201;
  ctx.response.body = { message: `File ${ctx.params.filename} saved` };
});

// catch-all for frontend
//router.get("/:path*", async (ctx) => {
//  const path = ctx.params.path || "index.html";
//  await send(ctx, path, { root: "static/" });
//});

// COOP + COEP headers for SharedArrayBuffer / OPFS
app.use(async (ctx, next) => {
  ctx.response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  ctx.response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  await next();
});

// catch sqlite requests
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname.startsWith("/static/dist/sqlite3-worker1.mjs")) {
    const path = ctx.request.url.pathname.replace("/static/dist/sqlite3-worker1.mjs", "");
    await send(ctx, path, { root: "./static/scripts/sqlite3-worker1.mjs" });
    return;
  }
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

// SPA middleware
app.use(async (ctx, next) => {
  if (ctx.response.body !== undefined || ctx.response.status !== 404) {
    return;
  }
    const { pathname } = ctx.request.url;
    log.debug(`requested path: ${pathname}`)
    // Don't intercept APIs or websockets
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/notes/") ||
      pathname.startsWith("/ws/")
    ) {
      return;
    }
  
    // Don't intercept WebSocket upgrades
    if (ctx.request.headers.get("upgrade") === "websocket") {
      await next();
      return;
    }
  
    if (ctx.request.method !== "GET") {
      await next();
      return;
    }
    // Only handle static
    if (pathname.startsWith("/static/")) {
        try {
        await send(ctx, pathname.replace("/static/", ""), {
            root: "static",
        });
        return;
        } catch (err) {
        if (err.name !== "NotFoundError") throw err;
        }
    }
    if (pathname === "/static/manifest.json") {
      log.debug("Got manifest request!")
      ctx.response.headers.set("Access-Control-Allow-Origin", "*");
      ctx.response.headers.set("Content-Type", "application/manifest+json");
    }

  await next();
    const relPath = pathname.replace(/^\/+/, "");
    // Try serving actual file
    try {
      await send(ctx, relPath || "index.html", {
        root: SPA_ROOT,
      });
      return;
    } catch (err) {
      if (err.name !== "NotFoundError") {
        throw err;
      }
    }
  
    // SPA fallback
    await send(ctx, "index.html", { root: SPA_ROOT });
  });
  
// ─── Periodic cleanup ─────────────────────────
setInterval(() => cleanupEmptyNotes(), 10 * 60 * 1000); // every 10min

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        return walk(fullPath);
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        return [fullPath];
      }

      return [];
    })
  );

  return files.flat();
}

async function updateMetadata(){
  log.info("Filling db");

  const db = createServerDB("vantagenotes.db");
  const metadataIndexer = createMetadataIndexer(db);
  await metadataIndexer.init();

  const files = await walk("static/notes");

  for (const filePath of files) {
    try {
      const text = await readFile(filePath, "utf8");

      const metadata = await MetadataExtractor.extractMetadata(text);
      log.debug(`metadata for file ${filePath}`)
      //log.debug(metadata)

      // Use relative path without extension as docId
      const docId = filePath
        .replace(/^static\/notes\//, "")
        .replace(/\.md$/, "");

      await metadataIndexer.indexDocument(docId, metadata);

      log.info(`Indexed: ${docId}`);
    } catch (err) {
      log.error(`Failed to index ${filePath}`, err);
    }
  }
}
// ─── Start servers ─────────────────────────────
async function main() {

  log.info("Filling db")
  await updateMetadata()
  
  const port = Deno.env.get("PORT");
  const ws_port = Deno.env.get("WS_PORT");
  log.info("http port is:", port, "WS port is:", ws_port)
  
  serveYjs({
    port: ws_port,
    persistence: "sqlite",
    sqlitePath: Deno.env.get("DB_PATH")
  });
  log.info(`Starting Deno Oak server on port ${port}`);
  await app.listen({ port });

  
}

main();
