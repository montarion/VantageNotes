import { createYjsHandler } from "./server.ts";
import { DocManager } from "./doc.ts";
import { KvPersistence } from "./persistence_kv.ts";
import { SqlitePersistence } from "./persistence_sqlite.ts";

export async function serveYjs(options: {
  port?: number;
  basePath?: string;
  persistence?: "kv" | "sqlite" | null;
  sqlitePath?: string;
}) {
  let persistence = undefined;

  if (options.persistence === "kv") {
    const kv = await Deno.openKv();
    persistence = new KvPersistence(kv);
  }

  if (options.persistence === "sqlite") {
    persistence = new SqlitePersistence(
      options.sqlitePath ?? "yjs.db",
    );
  }

  const docManager = new DocManager(persistence);
  const handler = createYjsHandler(
    docManager,
    { basePath: options.basePath },
  );

  Deno.serve({ port: options.port ?? 1234 }, handler);
}
