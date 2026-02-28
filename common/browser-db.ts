// browser-db.ts
// ---------------------------------------
// Initializes SQLite https://github.com/wuchuheng/web-sqlite-js
// ---------------------------------------

import openDB from "npm:web-sqlite-js";
import type { DBInterface } from "./db-interface.ts";
import init, { compile } from "../node_modules/prqlc/dist/web/prqlc_js.js"

export async function initBrowserDB(): Promise<DBInterface> {
  const db = await openDB("my-db", { debug: false });
  await init();

  // TODO: download sqlite3 file from server

  return {
    exec: async (sql) => await db.exec(sql),
    query: async (sql) => await db.query(sql),
    run: async (sql, params) => await db.run(sql, params),
    all: async (sql, params) => await db.all(sql, params),
    transaction: async (fn) => {
      await db.transaction(async (tx: any) => {
        await fn({
          exec: (sql) => tx.exec(sql),
          run: (sql, params) => tx.exec(sql, params),
          all: (sql, params) => tx.all(sql, params),
          transaction: async () => {
            throw new Error("Nested tx not supported");
          },
          pquery: async (prql) => await db.query(compile(prql))
        });
      });
    },
    pquery: async (prql) => await db.query(compile(prql)),
  };
}