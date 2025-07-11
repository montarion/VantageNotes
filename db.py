import os
import sqlite3
import json
from fuzzywuzzy import fuzz

DB_PATH = 'metadata.db'

EMPTY_METADATA = {
    "tags": [],
    "headers": [],
    "tasks": [],
    "wikilinks": [],
    "hyperlinks": [],
    "code_blocks": [],
    "images": []
}

import sqlite3

DB_PATH = 'metadata.db'

def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Main files table
    c.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            content TEXT NOT NULL
        )
    ''')

    # Full Text Search virtual table for filename and content
    c.execute('''
        CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            filename,
            content
        )
    ''')

    # Tags table
    c.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Headers table
    c.execute('''
        CREATE TABLE IF NOT EXISTS headers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            level INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Tasks table
    c.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            checked BOOLEAN NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Wikilinks table
    c.execute('''
        CREATE TABLE IF NOT EXISTS wikilinks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            target TEXT NOT NULL,
            alias TEXT,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Hyperlinks table
    c.execute('''
        CREATE TABLE IF NOT EXISTS hyperlinks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            label TEXT,
            url TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Code blocks table
    c.execute('''
        CREATE TABLE IF NOT EXISTS code_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            language TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    # Images table
    c.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            alt_text TEXT,
            url TEXT NOT NULL,
            FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    ''')

    conn.commit()
    conn.close()




def save_file_metadata(filename, metadata, content, db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Insert or update file record
    c.execute('''
        INSERT INTO files (filename, content) VALUES (?, ?)
        ON CONFLICT(filename) DO UPDATE SET content=excluded.content
    ''', (filename, content))

    # Get file_id
    c.execute('SELECT id FROM files WHERE filename=?', (filename,))
    file_id = c.fetchone()[0]

    # Clear old metadata for this file
    for table in ['tags', 'headers', 'tasks', 'wikilinks', 'hyperlinks', 'code_blocks', 'images']:
        c.execute(f'DELETE FROM {table} WHERE file_id=?', (file_id,))

    # Insert tags
    for tag in metadata.get('tags', []):
        tag_name = tag if isinstance(tag, str) else tag.get('name', '')
        if tag_name:
            c.execute('INSERT INTO tags (file_id, name) VALUES (?, ?)', (file_id, tag_name))

    # Insert headers
    for h in metadata.get('headers', []):
        c.execute('INSERT INTO headers (file_id, level, text) VALUES (?, ?, ?)', (file_id, h['level'], h['text']))

    # Insert tasks
    for t in metadata.get('tasks', []):
        c.execute('INSERT INTO tasks (file_id, text, checked) VALUES (?, ?, ?)', (file_id, t['text'], bool(t['checked'])))

    # Insert wikilinks
    for w in metadata.get('wikilinks', []):
        c.execute('INSERT INTO wikilinks (file_id, target, alias) VALUES (?, ?, ?)', (file_id, w['target'], w.get('alias')))

    # Insert hyperlinks
    for l in metadata.get('hyperlinks', []):
        c.execute('INSERT INTO hyperlinks (file_id, label, url) VALUES (?, ?, ?)', (file_id, l.get('label'), l['url']))

    # Insert code blocks
    for cb in metadata.get('code_blocks', []):
        c.execute('INSERT INTO code_blocks (file_id, language) VALUES (?, ?)', (file_id, cb.get('language', 'plain')))

    # Insert images
    for img in metadata.get('images', []):
        c.execute('INSERT INTO images (file_id, alt_text, url) VALUES (?, ?, ?)', (file_id, img.get('alt_text'), img['url']))

    # Update FTS table (delete old first)
    c.execute('DELETE FROM files_fts WHERE filename=?', (filename,))
    c.execute('INSERT INTO files_fts (filename, content) VALUES (?, ?)', (filename, content))

    conn.commit()
    conn.close()



def get_metadata(filename, db_path=DB_PATH):
    if not filename.endswith(".md"):
        filename += ".md"
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute('SELECT id FROM files WHERE filename=?', (filename,))
    row = c.fetchone()
    if not row:
        conn.close()
        return EMPTY_METADATA

    file_id = row[0]

    def fetchall_dict(query, params):
        c.execute(query, params)
        cols = [desc[0] for desc in c.description]
        return [dict(zip(cols, row)) for row in c.fetchall()]

    # Note: Changed 'tag' to 'name' to reflect schema
    tags = [r['name'] for r in fetchall_dict('SELECT name FROM tags WHERE file_id=?', (file_id,))]
    headers = fetchall_dict('SELECT level, text FROM headers WHERE file_id=?', (file_id,))
    tasks = fetchall_dict('SELECT text, checked FROM tasks WHERE file_id=?', (file_id,))
    wikilinks = fetchall_dict('SELECT target, alias FROM wikilinks WHERE file_id=?', (file_id,))
    hyperlinks = fetchall_dict('SELECT label, url FROM hyperlinks WHERE file_id=?', (file_id,))
    code_blocks = fetchall_dict('SELECT language FROM code_blocks WHERE file_id=?', (file_id,))
    images = fetchall_dict('SELECT alt_text, url FROM images WHERE file_id=?', (file_id,))

    conn.close()

    metadata =  {
        'tags': tags,
        'headers': headers,
        'tasks': tasks,
        'wikilinks': wikilinks,
        'hyperlinks': hyperlinks,
        'code_blocks': code_blocks,
        'images': images
    }
    return metadata



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
