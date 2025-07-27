import sqlite3
import json

class DocumentStore:
    def __init__(self, db_path="doc.db"):
        self.db_path = db_path
        self._init_db()

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

    def get_document_text(self, filename):
        save_path = f"static/notes/{filename}.md"
        with open(save_path) as f:
            data = f.read()
        return data

    def store_updates(self, doc_id, user_id, updates):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            for update in updates:
                if "changes" not in update or "clientID" not in update:
                    raise ValueError("Update must include clientID and changes")
                
                if update.get("clientID") == "system":
                    continue  # Skip system-generated init update
                # Optional: sanity check changes format
                assert isinstance(update["changes"], list), f"Changes must be a list (from toJSON()). Message was: {update}"
                
                print(f"Inserting update from {user_id}: {update}")
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
            print(rows)
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
            return [json.loads(row[0]) for row in rows]

    def rebuild_and_save_document(self, doc_id):
        print(f"Rebuilding document")
        updates = self.get_all_updates_for_doc(doc_id)  # list of change dicts
        print(updates)

        # Start with an empty list of characters (more efficient than string concat)
        doc = []

        for update in updates:
            changes = update['changes']

            # Some changes are a list of multiple operations; handle both formats
            if isinstance(changes[0], list):  # e.g., [[0, 'a']]
                for change in changes:
                    pos, value = change
                    doc.insert(pos, value)
            else:  # single operation, e.g., [4, [0, 'e']] or [4, [1]]
                pos, op = changes
                if op[0] == 0:
                    # Insert operation
                    char = op[1]
                    doc.insert(pos, char)
                elif op[0] == 1:
                    # Delete operation
                    if 0 <= pos < len(doc):
                        del doc[pos]

        final_text = ''.join(doc)
        print(f"Final document content: {final_text}")
        #self.save_document(doc_id, final_text)
        return final_text