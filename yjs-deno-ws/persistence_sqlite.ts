import { Persistence } from "./persistence.ts";
import * as Y from "npm:yjs";
import { DB } from "https://deno.land/x/sqlite/mod.ts";

export class SqlitePersistence extends Persistence {
  private db: DB;
  private maxUpdates: number;

  constructor(
    path = "yjs.db",
    options?: { maxUpdates?: number },
  ) {
    super(); // 👈 required

    this.db = new DB(path);
    this.maxUpdates = options?.maxUpdates ?? 500;

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS yjs_updates (
        room TEXT NOT NULL,
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        "update" BLOB NOT NULL,
        is_snapshot INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_yjs_room_seq
      ON yjs_updates(room, seq);
    `);
  }

  protected async loadImpl(room: string, doc: Y.Doc) {
    const rows = this.db.query<[Uint8Array]>(
      `SELECT "update" FROM yjs_updates
       WHERE room = ?
       ORDER BY seq ASC`,
      [room],
    );

    for (const [update] of rows) {
      Y.applyUpdate(doc, update);
    }
  }

  protected async storeUpdateImpl(room: string, update: Uint8Array) {
    this.db.query(
      `INSERT INTO yjs_updates (room, "update", created_at)
       VALUES (?, ?, ?)`,
      [room, update, Date.now()],
    );

    this.maybeCompact(room);
  }

  protected override afterStoreUpdate(room: string, update: Uint8Array) {
    super.afterStoreUpdate(room, update)
    // Optional: hooks live here instead of inline
    // e.g. logging, metrics, async compaction queue
  }

  private maybeCompact(room: string) {
    const [[count]] = this.db.query<[number]>(
      `SELECT COUNT(*) FROM yjs_updates WHERE room = ?`,
      [room],
    );

    if (count < this.maxUpdates) return;

    this.compactRoom(room);
  }

  private compactRoom(room: string) {
    const doc = new Y.Doc();

    const rows = this.db.query<[Uint8Array]>(
      `SELECT "update" FROM yjs_updates
       WHERE room = ?
       ORDER BY seq ASC`,
      [room],
    );

    for (const [update] of rows) {
      Y.applyUpdate(doc, update);
    }

    const snapshot = Y.encodeStateAsUpdate(doc);

    this.db.execute("BEGIN");
    try {
      this.db.query(`DELETE FROM yjs_updates WHERE room = ?`, [room]);

      this.db.query(
        `INSERT INTO yjs_updates
         (room, "update", is_snapshot, created_at)
         VALUES (?, ?, 1, ?)`,
        [room, snapshot, Date.now()],
      );

      this.db.execute("COMMIT");
    } catch (err) {
      this.db.execute("ROLLBACK");
      throw err;
    } finally {
      doc.destroy();
    }
  }

  close() {
    this.db.close();
  }
}
