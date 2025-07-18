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
            return [json.loads(row[0]) for row in rows]