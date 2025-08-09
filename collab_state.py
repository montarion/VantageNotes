import sqlite3
import json
import time
import os
from logger import log, Logger
class DocumentStore:
    def __init__(self, db_path="doc.db", NOTES_DIR = 'static/notes', snapshot_interval=20):
        self.db_path = db_path
        self.notes_path = NOTES_DIR
        self.snapshot_interval = snapshot_interval
        self._init_db()
        self.log = Logger("DocumentStore")

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute('''
                CREATE TABLE IF NOT EXISTS updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updates_json TEXT NOT NULL
                );
            ''')
            cur.execute('''
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')

            cur.execute('''
                CREATE TABLE IF NOT EXISTS snapshots (
                    doc_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    thumb BLOB
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

    def get_version(self, doc_id):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM updates WHERE doc_id = ?", (doc_id,))
            (count,) = cur.fetchone()
            return count


    def set_version(self, doc_id, version):
        key = f"version:{doc_id}"
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO metadata (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
            ''', (key, str(version)))
            conn.commit()

    def clear_updates_for_doc(self, doc_id):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM updates WHERE doc_id = ?", (doc_id,))
            conn.commit()

    def get_document_text(self, filename):
        save_path = f"static/notes/{filename}.md"
        try:
            with open(save_path) as f:
                data = f.read()
        except FileNotFoundError as e:
            data = ""
        return data

    def _generate_thumbnail(self, content, max_len=100):
        plain = content.strip().replace('\n', ' ')
        return plain[:max_len] + ('...' if len(plain) > max_len else '')


    def save_snapshot(self, doc_id, content, version, max_snapshots=10):
        thumbnail = self._generate_thumbnail(content)

        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()

            # Insert new snapshot (version should be unique per doc)
            cur.execute('''
                INSERT INTO snapshots (doc_id, version, content, thumb)
                VALUES (?, ?, ?, ?)
            ''', (doc_id, version, content, thumbnail))

            # Keep only latest `max_snapshots` versions
            cur.execute('''
                SELECT version FROM snapshots
                WHERE doc_id = ?
                ORDER BY version DESC
                LIMIT -1 OFFSET ?
            ''', (doc_id, max_snapshots))
            old_versions = cur.fetchall()

            if old_versions:
                cur.executemany('''
                    DELETE FROM snapshots
                    WHERE doc_id = ? AND version = ?
                ''', [(doc_id, v[0]) for v in old_versions])

            conn.commit()

    def store_updates(self, doc_id, user_id, new_updates):
        # TODO: do snapshots, so you don´t have to save all the updates forever. lets snapshots every 1000 updates
        updates = self.get_all_updates_for_doc(doc_id) + new_updates
        self.log(f"there are {len(updates)} updates.")
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            for update in updates:
                #self.log(f"Storing update: {new_updates}")
                if "changes" not in update or "clientID" not in update:
                    raise ValueError("Update must include clientID and changes")
                
                #if update.get("clientID") == "system":
                #    continue  # Skip system-generated init update
                # Optional: sanity check changes format
                assert isinstance(update["changes"], list), f"Changes must be a list (from toJSON()). Message was: {update}"
                
                #self.log(f"Inserting update from {user_id}: {update['changes']}")
                update_json = json.dumps(update)

                cur.execute(
                    "INSERT INTO updates (doc_id, user_id, updates_json) VALUES (?, ?, ?)",
                    (doc_id, user_id, update_json)
                )
        conn.commit()

    def get_updates_since(self, doc_id, version):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT updates_json
                FROM updates
                WHERE doc_id = ?
                ORDER BY id ASC
                LIMIT -1 OFFSET ?
            """, (doc_id, version))
            rows = cur.fetchall()
            return [json.loads(row[0]) for row in rows]

    def get_all_updates(self):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT updates_json FROM updates ORDER BY id ASC")
            rows = cur.fetchall()
            return [json.loads(row[0]) for row in rows]

    def get_all_updates_for_doc(self, doc_id):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT updates_json FROM updates
                WHERE doc_id = ?
                ORDER BY id ASC
            """, (doc_id,))
            rows = cur.fetchall()
            updates = [json.loads(row[0]) for row in rows]

        # 👇 Check if we need to insert the initial state
        if updates:
            return updates  # updates already exist

        # 👇 Otherwise, inject initial full document as synthetic update
        initial_text = self.get_document_text(doc_id)
        init_update = {
            "changes": [[0, initial_text]],
            "clientID": "system"
        }
        # Store it in the DB for future use
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO updates (doc_id, user_id, updates_json) VALUES (?, ?, ?)",
                (doc_id, "system", json.dumps(init_update))
            )
            conn.commit()
        return [init_update]

    def ensure_file_exists(self, path: str):
        # Ensure parent directories exist
        dir_name = os.path.dirname(path)
        if dir_name and not os.path.exists(dir_name):
            os.makedirs(dir_name)

        # Ensure the file exists
        if not os.path.exists(path):
            with open(path, 'w') as f:
                pass  # Create an empty file

    def save_document(self, filename, content):
        filepath = os.path.join(self.notes_path, filename)
        save_path = f"{filepath}.md"
        self.ensure_file_exists(save_path)
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def get_snapshots(self, doc_id):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT version, content, timestamp, thumb
                FROM snapshots
                WHERE doc_id = ?
                ORDER BY version ASC
            """, (doc_id,))
            rows = cur.fetchall()
            return [
                {
                    "version": row[0],
                    "content": row[1],
                    "timestamp": row[2]
                }
                for row in rows
            ]

    def reconstruct_document(self, doc_id):
        updates = self.get_all_updates_for_doc(doc_id)
        text = ""

        for update in updates:
            changes = update["changes"]
            text = self._apply_single_change(text, changes)
            #self.log(f"Text is {text} after operation {update}") # printing makes it too slow eventually
        self.log(f"applied change {updates[-1]['changes']}.")
        self.log(f"final text is: {text}")

        # Save document
        self.save_document(doc_id, text)
        return text


    def _apply_single_change(self, text, changes):
        # TODO: make deletions actually work
        #self.log(f"Applying change: {changes}")

        # Case 1: Full document insert or simple op in one array
        if len(changes) == 1 and isinstance(changes[0], list):
            op = changes[0]

            # Full replace: [[0, 'abc']]
            if len(op) == 2 and op[0] == 0 and isinstance(op[1], str):
                return op[1]
            
            # Insert at position: [[pos, 'abc']]
            if len(op) == 2 and isinstance(op[0], int) and isinstance(op[1], str):
                pos, content = op
                return text[:pos] + content + text[pos:]

            # Pure retain: [[18]] — no-op or used in delete-all
            if len(op) == 1 and isinstance(op[0], int):
                retain = op[0]
                return text[:retain]

            raise ValueError(f"Unknown single-item change: {changes}")

        # Case 2: [retain_before, op] or [retain_before, op, retain_after]
        if len(changes) == 2:
            a, b = changes
            if isinstance(a, int) and isinstance(b, list):
                retain_before, operation, retain_after = a, b, 0
            elif isinstance(a, list) and isinstance(b, int):
                retain_before, operation, retain_after = 0, a, b
            else:
                raise ValueError(f"Unexpected 2-element change: {changes}")
        elif len(changes) == 3:
            retain_before, operation, retain_after = changes
        else:
            raise ValueError(f"Unexpected change format: {changes}")

        start = retain_before
        end = len(text) - retain_after

        # Apply operation
        if isinstance(operation, list):
            if len(operation) == 2 and operation[0] == 0:
                # Insert
                return text[:start] + operation[1] + text[start:]
            elif len(operation) == 1 and operation[0] == 1:
                # Delete 1 character
                return text[:start] + text[start + 1:]
            else:
                raise ValueError(f"Unknown operation: {operation}")
        else:
            raise ValueError(f"Invalid operation format: {operation}")



        
            
