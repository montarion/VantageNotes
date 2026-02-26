// server-db.ts
import { DBInterface } from "./db-interface.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";

/**
 * Wraps deno-sqlite DB to implement DBInterface
 */
export function createServerDB(path: string): DBInterface {
  const db = new DB(path);

  return {
    async exec(sql: string) {
      db.execute(sql); // deno-sqlite executes directly
    },
    async query(sql: string) {
      db.query(sql);
    },
    async run(sql: string, params: any[] = []) {
      db.query(sql, params);
    },

    async all(sql: string, params: any[] = []) {
      const rows: any[] = [];
      for (const r of await db.query(sql, params)) {
        rows.push(r);
      }
      return rows;
    },

    async transaction<T>(fn: (tx: DBInterface) => Promise<T>) {
      await db.query("BEGIN");
      try {
        const result = await fn(this);
        await db.query("COMMIT");
        return result;
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }
    },
  };
}