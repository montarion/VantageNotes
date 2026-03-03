// browser-db.ts
// ---------------------------------------
// Initializes SQLite https://github.com/wuchuheng/web-sqlite-js
// ---------------------------------------

import openDB from "npm:web-sqlite-js";
import type { DBInterface } from "./db-interface.ts";
import init, { compile } from "../node_modules/prqlc/dist/web/prqlc_js.js"

async function applySync(db, data) {
  await db.transaction(async (tx) => {
    for (const change of data.changes) {
      if (change.action === "delete") {
        await tx.run(
          `DELETE FROM ${change.table} WHERE id = ?`,
          [change.row_id]
        );
      } else {
        const cols = Object.keys(change.row);
        const placeholders = cols.map(() => "?").join(",");
        const updates = cols.map(c => `${c}=excluded.${c}`).join(",");

        await tx.run(
          `
          INSERT INTO ${change.table} (${cols.join(",")})
          VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updates}
          `,
          Object.values(change.row)
        );
      }
    }
  });

  localStorage.setItem("lastSync", data.serverTime);
}
export async function initBrowserDB(): Promise<DBInterface> {
  const db = await openDB("my-db", { debug: false });
  await init();

  const url = new URL("/api/sync", window.location.origin);
  const lastupdate = "0"
  url.searchParams.set("since", lastupdate);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }

  const data = await response.json();
  console.log(data);
  await applySync(db, data)
  

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