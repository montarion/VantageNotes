// server-db.ts
import { DBInterface } from "./db-interface.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";
import prqlc from "npm:prqlc"

/**
 * Wraps deno-sqlite DB to implement DBInterface
 */
export function createServerDB(path: string): DBInterface {
  const db = new DB(path);

  db.execute(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    PRAGMA synchronous=NORMAL;
    PRAGMA cache_size=-20000;
  `);

  const iface: DBInterface = {
    async exec(sql: string) {
      db.execute(sql);
    },

    async query(sql: string) {
      return db.query(sql);
    },

    async run(sql: string, params: any[] = []) {
      return db.query(sql, params);
    },

    async all(sql: string, params: any[] = []) {
      const rows: any[] = [];
      for (const r of db.query(sql, params)) {
        rows.push(r);
      }
      return rows;
    },

    async transaction<T>(fn: (tx: DBInterface) => Promise<T>) {
      db.execute("BEGIN IMMEDIATE");

      try {
        const result = await fn(iface);
        db.execute("COMMIT");
        return result;
      } catch (err) {
        db.execute("ROLLBACK");
        throw err;
      }
    },

    async pquery(prql: string) {
      return db.query(prqlc.compile(prql));
    },
  };

  return iface;
}