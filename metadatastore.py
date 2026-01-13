# metadatastore.py
import sqlite3
import json
import os
import time
import re
import yaml
import inspect
from typing import Dict, List, Optional
from logger import Logger, Logging
from fuzzywuzzy import fuzz, process
import metadatatypes
from metadatatypes import Header, Tag, Task, CodeBlock, Wikilink, Hyperlink, Imagelink, PageMetadata
log = Logger("metadata")

class MetadataStore:
    """
    Stores metadata per file, supports full-text search, and allows updating metadata.
    """
    def __init__(self, db_path="metadata.db", notes_dir="static/notes"):
        self.db_path = db_path
        self.notes_dir = notes_dir
        # Dynamically detect all typed lists in PageMetadata
        self.typed_lists = self._discover_typed_lists()
        log.debug(f"Detected typed lists: {self.typed_lists}")

        # Precompute table columns for query validation
        self.table_columns = {}
        for list_name, cls in self.typed_lists.items():
            params = list(inspect.signature(cls.__init__).parameters.keys())[1:]  # skip self
            self.table_columns[list_name] = ["filename"] + params

        log.debug(f"Table columns precomputed: {self.table_columns}")
        self._last_scan_time = {}
        self._init_db()
        self.scan_all_files()

    def _discover_typed_lists(self):
        typed_lists = {}
        # Get all classes in metadatatypes
        all_classes = dict(inspect.getmembers(metadatatypes, inspect.isclass))
        
        # Get PageMetadata type hints
        annotations = getattr(metadatatypes.PageMetadata, '__annotations__', {})

        for attr_name, attr_type in annotations.items():
            # Only consider lists
            if getattr(attr_type, '__origin__', None) is list:
                item_type = attr_type.__args__[0]
                # Must be a class defined in metadatatypes and have from_match method
                if inspect.isclass(item_type) and item_type.__name__ in all_classes:
                    cls = all_classes[item_type.__name__]
                    if hasattr(cls, "from_match"):
                        typed_lists[attr_name] = cls

        return typed_lists
        
    def _init_db(self):
        """
        Creates all tables: metadata, content, and one table per typed list in PageMetadata.
        """
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()

            # Metadata table
            cur.execute('''
                CREATE TABLE IF NOT EXISTS metadata (
                    filename TEXT PRIMARY KEY,
                    metadata_json TEXT,
                    updated_at REAL
                )
            ''')

            # Full-text content
            cur.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS file_content
                USING fts5(filename, content)
            ''')

            # Create a table for each typed list dynamically
            for list_name, cls in self.typed_lists.items():
                # columns: filename + all __init__ args of the class
                init_params = inspect.signature(cls.__init__).parameters
                columns = ["filename TEXT"]
                for p in list(init_params.values())[1:]:  # skip self
                    columns.append(f"{p.name} TEXT")  # store everything as TEXT
                cols_sql = ", ".join(columns)
                sql = f"CREATE TABLE IF NOT EXISTS {list_name} ({cols_sql})"
                cur.execute(sql)

            conn.commit()


    def create_tables_from_classes(self, classes):
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            for cls in classes:
                table_name = cls.__name__.lower() + "s"  # Header -> headers
                # Get __init__ parameter names and types (skip 'self')
                cols = []
                for name, typ in cls.__init__.__annotations__.items():
                    col_type = "TEXT"  # default
                    if typ in (int, float):
                        col_type = "INTEGER"
                    elif typ == bool:
                        col_type = "BOOLEAN"
                    cols.append(f"{name} {col_type}")
                # always include filename as foreign key
                cols = ["filename TEXT"] + cols
                sql = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(cols)})"
                cur.execute(sql)
            conn.commit()

    def insert_metadata_rows(self, filename: str, metadata_obj):
        """
        Insert rows for all list attributes in PageMetadata.
        """
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            for attr_name, value_list in metadata_obj.__dict__.items():
                if isinstance(value_list, list) and value_list and hasattr(value_list[0], '__dict__'):
                    table_name = type(value_list[0]).__name__.lower() + "s"
                    for item in value_list:
                        columns = ["filename"] + list(item.__dict__.keys())
                        placeholders = ["?"] * len(columns)
                        values = [filename] + list(item.__dict__.values())
                        sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
                        cur.execute(sql, values)
            conn.commit()

    # ---------------- Metadata operations ----------------
    def set_metadata(self, filename: str, metadata: Dict):
        """
        Store metadata for a file, excluding the 'text' field.
        """
        metadata_copy = metadata.copy()
        metadata_copy.pop("text", None)  # remove text before storing
        metadata_json = json.dumps(metadata_copy)
        timestamp = time.time()
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute('''
                INSERT INTO metadata (filename, metadata_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(filename) DO UPDATE SET
                    metadata_json=excluded.metadata_json,
                    updated_at=excluded.updated_at
            ''', (filename, metadata_json, timestamp))
            conn.commit()

    def extract_metadata_from_text(self, text: str) -> PageMetadata:
        lines = text.splitlines()
        metadata = PageMetadata(text)
        metadata.line_count = len(lines)

        # ---------- Frontmatter ----------
        frontmatter = None
        content_start = 0
        if lines and lines[0].strip() == "---":
            for i, line in enumerate(lines[1:], start=1):
                if line.strip() == "---":
                    try:
                        frontmatter = yaml.safe_load("\n".join(lines[1:i]))
                    except Exception as e:
                        log.error(f"Failed to parse YAML frontmatter: {e}")
                    content_start = i + 1
                    break
        metadata.frontmatter = frontmatter

        # ---------- Code block state ----------
        in_code_block = False
        code_block_start_line = 0
        code_block_language = None
        code_block_content: list[str] = []

        # ---------- Iterate over lines ----------
        for idx, line in enumerate(lines[content_start:], start=content_start):
            line_number = idx + 1

            for list_name, cls in self.typed_lists.items():
                # Handle code_blocks separately (multiline)
                if list_name == "code_blocks":
                    m = re.match(r'^```(\w+)?', line)
                    if m:
                        if not in_code_block:
                            in_code_block = True
                            code_block_start_line = line_number
                            code_block_language = m.group(1) or "plain"
                            code_block_content = []
                        else:
                            in_code_block = False
                            metadata.code_blocks.append(cls(
                                language=code_block_language,
                                from_line=code_block_start_line,
                                to_line=line_number,
                                code="\n".join(code_block_content)
                            ))
                        break  # skip further processing of this line
                    if in_code_block:
                        code_block_content.append(line)
                else:
                    regex = getattr(cls, "regex", None)
                    if regex is None:
                        continue

                    # Tags often return simple strings
                    if list_name in ("tags",):
                        for match in regex.findall(line):
                            getattr(metadata, list_name).append(cls.from_match(match, line_number, line))
                    else:
                        for match in regex.finditer(line):
                            getattr(metadata, list_name).append(cls.from_match(match, line_number))

                            # Special case: first H1 sets frontmatter title
                            if list_name == "headers" and metadata.frontmatter and "title" not in metadata.frontmatter:
                                if match.group(1) == "#":
                                    metadata.frontmatter["title"] = match.group(2)

        return metadata





    

    def get_metadata(self, filename: str) -> Optional[Dict]:
        """
        Returns metadata for a file, and includes the file text under 'text' key.
        """
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()

            # Fetch metadata JSON
            cur.execute("SELECT metadata_json FROM metadata WHERE filename = ?", (filename,))
            row = cur.fetchone()
            if not row:
                return None

            metadata = json.loads(row[0]) if row[0] else {}

            # Fetch file text separately
            cur.execute("SELECT content FROM file_content WHERE filename = ?", (filename,))
            text_row = cur.fetchone()
            metadata['text'] = text_row[0] if text_row else ""

            return metadata


    def get_all_metadata(self) -> Dict[str, Dict]:
        result = {}
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT filename, metadata_json FROM metadata")
            for filename, meta_json in cur.fetchall():
                result[filename] = json.loads(meta_json)
        return result

    # ---------------- Full-text search ----------------
    def index_file_content(self, filename: str, content: Optional[str] = None, metadata: Optional[Dict] = None):
        """
        Index the file content for full-text search. Uses `metadata['text']` if available,
        otherwise reads from notes_dir. Does not store 'text' in metadata table.
        """
        if content is None and metadata and "text" in metadata:
            content = metadata["text"]

        if content is None:
            path = os.path.join(self.notes_dir, filename + ".md")
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except FileNotFoundError:
                content = ""

        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            # Remove old content
            cur.execute("DELETE FROM file_content WHERE filename = ?", (filename,))

            # Insert into FTS5
            cur.execute(
                "INSERT INTO file_content (filename, content) VALUES (?, ?)",
                (filename, content)
            )

            conn.commit()

    def search_fuzzy(self, query: str, threshold: int = 80, snippet_chars: int = 50) -> List[Dict]:
        """
        Fuzzy search across metadata and full-text content.
        Supports multi-word phrase matching in content.
        Returns:
        {
            "filename": str,
            "match_type": "metadata" | "content",
            "match_field": Optional[str],  # metadata key
            "matched_text": Optional[str],  # substring that matched
            "snippet": Optional[str]        # for content
        }
        Only returns results with a match ratio above `threshold`.
        """
        results = []
        query_lower = query.lower()

        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()

            # --- Metadata fuzzy search ---
            cur.execute("SELECT filename, metadata_json FROM metadata")
            for filename, meta_json in cur.fetchall():
                meta_dict = json.loads(meta_json)
                for key, value in meta_dict.items():
                    value_str = str(value)
                    words = value_str.split()
                    best_match, score = process.extractOne(query_lower, words, scorer=fuzz.partial_ratio)
                    if score >= threshold:
                        results.append({
                            "filename": filename,
                            "match_type": "metadata",
                            "match_field": key,
                            "matched_text": best_match
                        })

            # --- Content fuzzy search (multi-word) ---
            cur.execute("SELECT filename, content FROM file_content")
            for filename, content in cur.fetchall():
                content_lower = content.lower()
                # sliding window of length equal to query words
                query_words = query_lower.split()
                window_size = len(query_words)
                content_words = content_lower.split()

                best_match_text = None
                best_score = 0
                best_index = 0

                for i in range(len(content_words) - window_size + 1):
                    window = " ".join(content_words[i:i + window_size])
                    score = fuzz.partial_ratio(query_lower, window)
                    if score > best_score:
                        best_score = score
                        best_match_text = window
                        best_index = i

                if best_score >= threshold:
                    # reconstruct snippet around the best match
                    snippet_start = max(best_index - 5, 0)
                    snippet_end = min(best_index + window_size + 5, len(content_words))
                    snippet = " ".join(content_words[snippet_start:snippet_end])
                    results.append({
                        "filename": filename,
                        "match_type": "content",
                        "matched_text": best_match_text,
                        "snippet": snippet
                    })

        return results

    def scan_all_files(self):
        """
        Scan every .md file under notes_dir and update the database.
        Calls scan_file() for each file.
        """
        log.debug("Scanning all files")
        scanned = []
        for root, _, files in os.walk(self.notes_dir):
            for f in files:
                if f.endswith(".md"):
                    # filename relative to notes_dir, without .md extension
                    rel_path = os.path.relpath(os.path.join(root, f), self.notes_dir)
                    filename = os.path.splitext(rel_path)[0]

                    meta = self.scan_file(filename)
                    if meta is not None:
                        scanned.append(filename)

        log.debug(f"Scanned {len(scanned)} files into metadata store")
        return scanned

    def scan_file(self, filename: str):
        """
        Scan a single Markdown file, extract metadata, update DB tables and full-text index.
        Debounced: only runs once per second per file.
        """
        now = time.time()
        last_time = self._last_scan_time.get(filename, 0.0)
        if now - last_time < 0.2:
            log.debug(f"Debounced scan_file for '{filename}' (last scanned {now - last_time:.2f}s ago)")
            return None  # skip because called too soon

        self._last_scan_time[filename] = now  # update last scan time

        path = os.path.join(self.notes_dir, filename + ".md")
        if not os.path.exists(path):
            log.warn(f"File not found: {path}")
            return None

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        metadata: PageMetadata = metadatatypes.PageMetadata(content)
        metadata = self.extract_metadata_from_text(content)

        # JSON-serializable metadata
        metadata_dict = MetadataStore.to_dict(metadata)
        metadata_dict.update({
            "filename": filename,
            "filesize": os.path.getsize(path),
            "modified_time": os.path.getmtime(path)
        })

        # --- Store main metadata and content ---
        self.set_metadata(filename, metadata_dict)
        self.index_file_content(filename, metadata=metadata_dict)

        # --- Store typed lists dynamically ---
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()

            for list_name, cls in self.typed_lists.items():
                items: list = getattr(metadata, list_name, [])
                # Delete old rows
                cur.execute(f"DELETE FROM {list_name} WHERE filename = ?", (filename,))
                if not items:
                    continue

                # Prepare insertion
                init_params = list(inspect.signature(cls.__init__).parameters.keys())[1:]  # skip self
                placeholders = ", ".join("?" for _ in init_params)
                sql = f"INSERT INTO {list_name} (filename, {', '.join(init_params)}) VALUES (?, {placeholders})"
                values = []
                for item in items:
                    row = [getattr(item, p) for p in init_params]
                    values.append([filename] + row)
                cur.executemany(sql, values)

            conn.commit()

        log.debug(f"Scanned and indexed file: {filename}")
        return metadata_dict

    def search_metadata(self, query: str) -> List[str]:
        """
        Returns filenames where the metadata JSON contains the query string.
        Simple LIKE search for now.
        """
        pattern = f"%{query}%"
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT filename
                FROM metadata
                WHERE metadata_json LIKE ?
            """, (pattern,))
            return [row[0] for row in cur.fetchall()]

    def search_content(self, query: str) -> List[str]:
        """
        Returns filenames where the file content matches the FTS query.
        """
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT filename
                FROM file_content
                WHERE file_content MATCH ?
            """, (query,))
            return [row[0] for row in cur.fetchall()]


    def search_combined_with_snippets(self, query: str, snippet_chars: int = 50, threshold: int = 80) -> List[Dict]:
        """
        Search both metadata (exact-ish) and content (fuzzy) matches.
        Returns detailed matches including the part of metadata or content that matched.
        """
        results = []

        # ---------------- Metadata exact-ish matches ----------------
        pattern = query.lower()
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT filename, metadata_json FROM metadata")
            for filename, meta_json in cur.fetchall():
                meta_dict = json.loads(meta_json)
                for key, value in meta_dict.items():
                    value_str = str(value).lower()
                    if pattern in value_str:
                        results.append({
                            "filename": filename,
                            "match_type": "metadata",
                            "match_field": key,
                            "matched_text": value
                        })

        # ---------------- Fuzzy content matches ----------------
        fuzzy_matches = self.search_fuzzy(query, threshold=threshold, snippet_chars=snippet_chars)
        results.extend(fuzzy_matches)

        return results



    # ---------------- Update helper ----------------
    def update_file(self, filename: str, metadata: Dict):
        """
        Call this when a file changes: updates both metadata and content index.
        'metadata' may contain a 'text' field used for full-text indexing.
        """
        self.set_metadata(filename, metadata)
        self.index_file_content(filename, metadata=metadata)
        self.extract_tasks_and_tags(filename, metadata.get("text", ""))\

    # ---------------- Query helper -----------------
    def query(self, query_str: str):
        query_str = query_str.strip().lower()
        log.debug(f"Query string: {query_str}")
        log.debug(f"table columns: {self.table_columns.keys()}")
        for table, columns in self.table_columns.items():
            if query_str.startswith(table):
                sql = f"SELECT * FROM {table}"
                conditions = []
                log.debug(f"Found table for query: {table}")

                if "where" in query_str:
                    where_clause = query_str.split("where", 1)[1].strip()
                    for cond in re.split(r"\s+and\s+", where_clause):
                        cond = cond.strip()
                        # convert booleans
                        cond = cond.replace("true", "1").replace("false", "0")

                        # validate column exists
                        col_match = re.match(r"(\w+)\s*[=<>]", cond)
                        if col_match and col_match.group(1) not in columns:
                            raise ValueError(f"Unknown column '{col_match.group(1)}' for table '{table}'")
                        conditions.append(cond)

                if conditions:
                    sql += " WHERE " + " AND ".join(conditions)
                log.debug(f"Final SQL statement: {sql}")
                with sqlite3.connect(self.db_path) as conn:
                    conn.row_factory = sqlite3.Row
                    cur = conn.cursor()
                    cur.execute(sql)
                    rows = cur.fetchall()

                    results = []
                    for row in rows:
                        d = dict(row)
                        # convert integer 0/1 back to booleans
                        for k, v in d.items():
                            if v in ("0", "1"):  # only touch ints that look like booleans
                                # If the column is one you know should be a bool
                                if k in ("done",):  # you can expand this tuple if more bool cols
                                    log.debug(f"checking bools - {d} - {v}(from{k}) turned into {bool(int(v))}")
                                    d[k] = bool(int(v))
                        results.append(d)

                    return results

        raise ValueError(f"Unsupported query: {query_str}")




    @staticmethod
    def to_dict(obj):
        """
        Recursively convert object to dicts/lists so it is JSON-serializable.
        """
        if isinstance(obj, list):
            return [MetadataStore.to_dict(x) for x in obj]
        if isinstance(obj, dict):
            return {k: MetadataStore.to_dict(v) for k, v in obj.items()}
        if hasattr(obj, '__dict__'):
            return {k: MetadataStore.to_dict(v) for k, v in obj.__dict__.items()}
        return obj