import os
import traceback
from datetime import date
from urllib.parse import parse_qs
import asyncio

from quart import Quart, render_template, request, jsonify, send_from_directory, websocket
from quart_compress import Compress

import metadata
import db
from collab_state import DocumentStore
from logger import Logger
log = Logger("Main")

from collab_ws import start_yjs_server

NOTES_DIR = 'static/notes'

db.init_db()
db.load_all_notes(NOTES_DIR, parser=metadata.parse_markdown_file)

app = Quart(__name__)
Compress(app)

os.chdir("/home/jamiro/code/vantagenotes/")

doc_store = DocumentStore("doc.db")

def build_file_tree(path):
    tree = []
    for entry in os.scandir(path):
        if entry.name.startswith('.'):
            continue  # Skip hidden files
        if entry.is_dir():
            tree.append({
                "name": entry.name,
                "type": "folder",
                "children": build_file_tree(os.path.join(path, entry.name))
            })
        else:
            if os.path.getsize(entry.path) == 0:
                os.remove(entry.path) # remove empty files (say, from building wikilinks)
                continue  # Skip empty files
            tree.append({
                "name": entry.name,
                "type": "file"
            })
    return tree


@app.route("/")
async def main():
    return await render_template("index.html")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
async def catch_all(path):
    if path.startswith("notes/") or path.startswith("api/"):
        return "Not Found", 404

    static_path = os.path.join("static", path)
    if os.path.exists(static_path) and not os.path.isdir(static_path):
        return await send_from_directory("static", path)

    return await render_template("index.html")


@app.route("/api/notes")
async def filelist():
    full_path = os.path.abspath("static/notes")
    tree = build_file_tree(full_path)
    return jsonify(tree)


@app.route('/api/metadata/<path:filename>')
async def api_get_metadata(filename):
    md = db.get_metadata(filename)
    return jsonify(md)


@app.route('/api/search')
async def api_search():
    q = request.args.get('q', '')
    field = request.args.get('field', None)
    tag = request.args.get('tag', None)
    has_tasks = request.args.get('has_tasks', None)
    if has_tasks is not None:
        has_tasks = has_tasks.lower() == 'true'

    results = db.search(q, field=field, tag=tag, has_tasks=has_tasks)
    return jsonify(results)


@app.route("/notes/<path:filename>", methods=['GET', 'POST'])
async def notes(filename):
    save_path = f"static/notes/{filename}.md"

    if request.method == "GET":
        try:
            with open(save_path) as f:
                data = f.read()
        except FileNotFoundError:
            doc_store.ensure_file_exists(save_path)
            with open(save_path) as f:
                data = f.read()
        return data

    if request.method == "POST":
        doc_store.ensure_file_exists(save_path)

        body = await request.get_data()
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(body.decode("utf-8"))

        return jsonify({'message': f'File {filename} uploaded successfully.'}), 201

    return jsonify({'message': f'Something when wrong while saving {filename}.'}), 500


async def main():
    await asyncio.gather(
        app.run_task(host="0.0.0.0", port=11624),
        start_yjs_server(host="0.0.0.0", port=11625), 
    )

if __name__ == "__main__":
    asyncio.run(main())
