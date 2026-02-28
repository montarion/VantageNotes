// metadataIndexer.ts
// --------------------------------------------
// Takes output of MetadataExtractor
// Writes structured data into SQLite
// Uses proper transactions via web-sqlite-js
// --------------------------------------------

import type { Metadata } from "./metadata.ts";
import { Logger } from "./logger.ts";

const log = new Logger({ namespace: "MetadataIndexer" });
export interface MetadataIndexer {
  init(): Promise<void>;
  indexDocument(docId: string, metadata: Metadata): Promise<void>;
  deleteDocument(docId: string): Promise<void>;
}

/**
 * Expects an sqlite DB instance that supports:
 *   db.exec(sql)
 *   db.run(sql, params?)
 *   db.all(sql, params?)
 *   db.transaction(async (tx) => { ... })
 */
export function createMetadataIndexer(db: any): MetadataIndexer {
  
  async function init() {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS frontmatter (
        document_id TEXT,
        key TEXT,
        updated_at INTEGER,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS entities (
        document_id TEXT,
        entity_id TEXT,
        alias TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(document_id, entity_id, alias, position)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        document_id TEXT NOT NULL,
        task_content TEXT NOT NULL,
        task_complete BOOL NOT NULL,
        due_date INTEGER,
        priority INTEGER,
        line_number INTEGER,
        position INTEGER,
        entities TEXT,
        updated_at INTEGER,
        UNIQUE(document_id, line_number)
      );

      CREATE TABLE IF NOT EXISTS tags (
        document_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER,
        PRIMARY KEY (document_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS semantics (
        document_id TEXT,
        path TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(document_id, path, position)
      );

      CREATE TABLE IF NOT EXISTS wikilinks (
        source_doc TEXT,
        target TEXT,
        alias TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(source_doc, target, alias, position)
      );

      CREATE TABLE IF NOT EXISTS transclusions (
        source_doc TEXT,
        target TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(source_doc, target, position)
      );

      CREATE TABLE IF NOT EXISTS external_links (
        source_doc TEXT,
        url TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(source_doc, url, position)
      );

      CREATE TABLE IF NOT EXISTS headers (
        document_id TEXT,
        level INTEGER,
        text TEXT,
        position INTEGER,
        updated_at INTEGER,
        UNIQUE(document_id, level, text, position)
      );

      CREATE TABLE IF NOT EXISTS changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        action TEXT NOT NULL, -- insert | update | delete
        updated_at INTEGER NOT NULL
      );
    `);
  }

  async function deleteDocument(docId: string) {
    await db.transaction(async (tx: any) => {
      const tables = [
        ["documents", "id"],
        ["frontmatter", "document_id"],
        ["entities", "document_id"],
        ["semantics", "document_id"],
        ["wikilinks", "source_doc"],
        ["transclusions", "source_doc"],
        ["external_links", "source_doc"],
        ["headers", "document_id"],
        ["tags", "document_id"]
      ];

      for (const [table, col] of tables) {
        await tx.run(`DELETE FROM ${table} WHERE ${col} = ?`, [docId]);
      }
    });
  }

  async function indexDocument(docId: string, metadata: Metadata) {
    console.debug(`updating index for id ${docId} `)
    try{
      await db.transaction(async (tx: any) => {
        // Remove previous index for this doc (inside same transaction)
        const tables = [
          ["frontmatter", "document_id"],
          ["entities", "document_id"],
          ["semantics", "document_id"],
          ["wikilinks", "source_doc"],
          ["transclusions", "source_doc"],
          ["external_links", "source_doc"],
          ["headers", "document_id"],
          ["tags", "document_id"],
          ["tasks", "document_id"]
        ];

        for (const [table, col] of tables) {
          await tx.run(`DELETE FROM ${table} WHERE ${col} = ?`, [docId]);
        }

        // Insert document record
        const now = Date.now();
        await tx.run(
          "INSERT OR REPLACE INTO documents (id, updated_at) VALUES (?, ?)",
          [docId, now]
        );
        log.debug(`metadata keys: ${Object.keys(metadata)}`)
        log.debug(`index for id ${docId} updated`)

        

        /* -------------------------
          Frontmatter
        ------------------------- */
        if (metadata.frontmatter?.attributes) {
          log.debug(`metadata keys: ${Object.values(metadata.frontmatter)}`)

          for (const [key, value] of Object.entries(metadata.frontmatter.attributes)) {
            await tx.run(
              "INSERT INTO frontmatter (document_id, key, value) VALUES (?, ?, ?)",
              [docId, key, JSON.stringify(value)]
            );
          }
        }

        /* -------------------------
          Entities
        ------------------------- */
        for (const bucket of Object.values(metadata.entities)) {
          for (const [entityId, entry] of Object.entries(bucket)) {
            const e: any = entry;
            const aliases = e.aliases?.length ? e.aliases : [null];
            for (const pos of e.positions) {
              for (const alias of aliases) {
                await tx.run(
                  "INSERT INTO entities (document_id, entity_id, alias, position) VALUES (?, ?, ?, ?)",
                  [docId, entityId, alias ?? null, pos]
                );
              }
            }
          }
        }

        /* -------------------------
          Semantics
        ------------------------- */
        for (const [path, entry] of Object.entries(metadata.semantics)) {
          const s: any = entry;
          for (const pos of s.positions) {
            await tx.run(
              "INSERT INTO semantics (document_id, path, position) VALUES (?, ?, ?)",
              [docId, path, pos]
            );
          }
        }

        /* -------------------------
          Wikilinks
        ------------------------- */
        for (const [target, entry] of Object.entries(metadata.links.wikilinks)) {
          const w: any = entry;
          for (const pos of w.positions) {
            await tx.run(
              "INSERT INTO wikilinks (source_doc, target, alias, position) VALUES (?, ?, ?, ?)",
              [docId, target, null, pos]
            );
          }
        }

        /* -------------------------
          Transclusions
        ------------------------- */
        for (const [target, entry] of Object.entries(metadata.links.transclusions)) {
          const t: any = entry;
          for (const pos of t.positions) {
            await tx.run(
              "INSERT INTO transclusions (source_doc, target, position) VALUES (?, ?, ?)",
              [docId, target, pos]
            );
          }
        }

        /* -------------------------
          External links
        ------------------------- */
        for (const [url, entry] of Object.entries(metadata.links.external)) {
          const e: any = entry;
          for (const pos of e.positions) {
            await tx.run(
              "INSERT INTO external_links (source_doc, url, position) VALUES (?, ?, ?)",
              [docId, url, pos]
            );
          }
        }

        /* -------------------------
          Headers
        ------------------------- */
        for (const h of metadata.structure.headers) {
          await tx.run(
            "INSERT INTO headers (document_id, level, text, position) VALUES (?, ?, ?, ?)",
            [docId, h.level, h.text, h.position]
          );
        }

        /* -------------------------
          tags
        ------------------------- */
        for (const [tag, count] of Object.entries(metadata.tags)) {
          await tx.run(
            `
              INSERT INTO tags (document_id, tag_id, count)
              VALUES (?, ?, ?)
              ON CONFLICT(document_id, tag_id) 
              DO UPDATE SET count = excluded.count
            `,
            [docId, tag, count]
          );
        }

        /* -------------------------
          Tasks
        ------------------------- */
        for (const task of metadata.tasks) {
          await tx.run(
            `
              INSERT INTO tasks (
                document_id,
                task_content,
                task_complete,
                due_date,
                priority,
                line_number,
                position,
                entities
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(document_id, line_number)
              DO UPDATE SET
                task_content = excluded.task_content,
                task_complete = excluded.task_complete,
                due_date = excluded.due_date,
                priority = excluded.priority,
                position = excluded.position,
                entities = excluded.entities
            `,
            [
              docId,
              task.task_content,
              task.task_complete ? 1 : 0,
              task.due_date,
              task.priority,
              task.line_number,
              task.position,
              JSON.stringify(task.entities ?? [])
            ]
          );
        }
        
      });
    }catch(err){
      console.error(err)
    }
    console.debug("finished transaction")
  }

  return {
    init,
    indexDocument,
    deleteDocument,
  };
}