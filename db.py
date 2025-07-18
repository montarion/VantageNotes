import os
import sqlite3
import json
from fuzzywuzzy import fuzz

DB_PATH = 'storage.db'

EMPTY_METADATA = {
    "tags": [],
    "headers": [],
    "tasks": [],
    "wikilinks": [],
    "hyperlinks": [],
    "code_blocks": [],
    "images": []
}



def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Main files table
    c.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT  -- store as JSON string
        )
    ''')

    # Full Text Search virtual table for filename and content
    c.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            filename,
            content
        )
    ''')

    
    conn.commit()
    conn.close()


def save_file(filename, content, metadata, db_path=DB_PATH):
    metadata_json = json.dumps(metadata)
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute('''
        INSERT INTO files (filename, content, metadata_json)
        VALUES (?, ?, ?)
        ON CONFLICT(filename) DO UPDATE SET
            content=excluded.content,
            metadata_json=excluded.metadata_json
    ''', (filename, content, metadata_json))

    # Update FTS (if still used)
    c.execute('DELETE FROM files_fts WHERE filename=?', (filename,))
    c.execute('INSERT INTO files_fts (filename, content) VALUES (?, ?)', (filename, content))

    conn.commit()
    conn.close()


def save_file_metadata(filename, metadata, content, db_path=DB_PATH):
    metadata_json = json.dumps(metadata)

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Insert or update the file row, including metadata as JSON
    c.execute('''
        INSERT INTO files (filename, content, metadata_json)
        VALUES (?, ?, ?)
        ON CONFLICT(filename) DO UPDATE SET
            content=excluded.content,
            metadata_json=excluded.metadata_json
    ''', (filename, content, metadata_json))

    # Update FTS index
    c.execute('DELETE FROM files_fts WHERE filename=?', (filename,))
    c.execute('INSERT INTO files_fts (filename, content) VALUES (?, ?)', (filename, content))

    conn.commit()
    conn.close()



def get_metadata(filename, db_path=DB_PATH):
    if not filename.endswith(".md"):
        filename += ".md"
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute('SELECT metadata_json FROM files WHERE filename=?', (filename,))
    row = c.fetchone()
    conn.close()

    if row and row[0]:
        return json.loads(row[0])
    else:
        return EMPTY_METADATA




def flatten_metadata(meta: dict) -> str:
    parts = []
    parts.extend([t if isinstance(t, str) else t.get('name', '') for t in meta.get('tags', [])])
    parts.extend([h['text'] for h in meta.get('headers', [])])
    parts.extend([t['text'] for t in meta.get('tasks', [])])
    parts.extend([w['target'] for w in meta.get('wikilinks', [])])
    parts.extend([h['url'] for h in meta.get('hyperlinks', [])])
    parts.extend([c.get('language', '') for c in meta.get('code_blocks', [])])
    parts.extend([img.get('alt_text', '') for img in meta.get('images', [])])
    return ' '.join(parts)


def highlight_text(text, query):
    query = query.lower()
    text_lc = text.lower()

    matches = []
    for word in query.split():
        idx = text_lc.find(word)
        if idx != -1:
            matches.append((idx, idx + len(word)))

    merged = []
    for start, end in sorted(matches):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    result = ""
    last = 0
    for start, end in merged:
        result += text[last:start] + "<mark>" + text[start:end] + "</mark>"
        last = end
    result += text[last:]
    return result


def search(query, field=None, tag=None, has_tasks=None, limit=10, db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    query = query.strip()
    results = []

    base_query = '''
        SELECT DISTINCT f.filename, f.content
        FROM files f
    '''
    joins = []
    wheres = []
    params = []

    if tag:
        joins.append('JOIN tags t ON f.id = t.file_id')
        wheres.append('t.name = ?')
        params.append(tag)

    if has_tasks is True:
        joins.append('JOIN tasks tk ON f.id = tk.file_id')
    elif has_tasks is False:
        wheres.append('f.id NOT IN (SELECT file_id FROM tasks)')

    if field:
        if field == 'tags':
            joins.append('JOIN tags ft ON f.id = ft.file_id')
            wheres.append('ft.name LIKE ?')
            params.append(f'%{query}%')
        elif field == 'headers':
            joins.append('JOIN headers h ON f.id = h.file_id')
            wheres.append('h.text LIKE ?')
            params.append(f'%{query}%')
        elif field == 'tasks':
            joins.append('JOIN tasks tk ON f.id = tk.file_id')
            wheres.append('tk.text LIKE ?')
            params.append(f'%{query}%')
        elif field == 'wikilinks':
            joins.append('JOIN wikilinks w ON f.id = w.file_id')
            wheres.append('w.target LIKE ?')
            params.append(f'%{query}%')
        elif field == 'hyperlinks':
            joins.append('JOIN hyperlinks l ON f.id = l.file_id')
            wheres.append('(l.url LIKE ? OR l.label LIKE ?)')
            params.extend([f'%{query}%', f'%{query}%'])
        elif field == 'code_blocks':
            joins.append('JOIN code_blocks c ON f.id = c.file_id')
            wheres.append('c.language LIKE ?')
            params.append(f'%{query}%')

    if not field and query:
        # Fallback to FTS
        c.execute('''
            SELECT f.filename, f.content
            FROM files_fts ft
            JOIN files f ON f.filename = ft.filename
            WHERE files_fts MATCH ?
            LIMIT ?
        ''', (query + '*', limit))
        rows = c.fetchall()
    else:
        # Construct final query
        sql = base_query + ' ' + ' '.join(joins)
        if wheres:
            sql += ' WHERE ' + ' AND '.join(wheres)
        sql += ' LIMIT ?'
        params.append(limit)

        c.execute(sql, params)
        rows = c.fetchall()

    for filename, content in rows:
        try:
            meta = get_metadata(filename, db_path)
            flat_meta = flatten_metadata(meta)

            filename_score = fuzz.partial_ratio(query.lower(), filename.lower()) if query else 0
            meta_score = fuzz.partial_ratio(query.lower(), flat_meta.lower()) if query else 0
            content_score = fuzz.partial_ratio(query.lower(), content.lower()) if query else 0
            best_score = max(filename_score, meta_score, content_score)

            if best_score >= 60 or field or tag or has_tasks is not None:
                results.append({
                    'filename': filename,
                    'metadata_snippet': flat_meta[:200],
                    'content_snippet': content[:200],
                    'highlighted_filename': highlight_text(filename, query),
                    'highlighted_metadata': highlight_text(flat_meta[:200], query),
                    'highlighted_content': highlight_text(content[:200], query),
                    'score': best_score
                })
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            continue

    results.sort(key=lambda r: r['score'], reverse=True)
    conn.close()
    return results[:limit]


def load_all_notes(notes_dir, db_path=DB_PATH, parser=None):
    if parser is None:
        raise ValueError("A parser function must be provided")

    for root, dirs, files in os.walk(notes_dir):
        for fname in files:
            if fname.endswith('.md'):
                path = os.path.join(root, fname)
                try:
                    metadata_obj, content = parser(path)
                    rel_path = os.path.relpath(path, notes_dir)
                    save_file_metadata(rel_path, metadata_obj, content, db_path)
                except Exception as e:
                    print(f"Error parsing {path}: {e}")
