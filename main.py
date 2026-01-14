import os
import traceback
from datetime import date
from urllib.parse import parse_qs
import asyncio
import json
import time

from quart import Quart, render_template, request, jsonify, send_from_directory, websocket
from quart_compress import Compress
from pathlib import Path

from logger import Logger, Logging
from helpers import Helpers
log = Logger("main")

from collab_ws import start_yjs_server
#from metadatastore import MetadataStore
NOTES_DIR = 'static/notes'
NOTES_ROOT = Path(NOTES_DIR).resolve()
app = Quart(__name__)
Compress(app)
#store = MetadataStore()
os.chdir("/home/jamiro/code/vantagenotes/")
helper = Helpers()

EMPTY_FILE_AGE_THRESHOLD = 10  # seconds (1 hour)


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
                #os.remove(entry.path) # remove empty files (say, from building wikilinks)
                continue  # Skip empty files

            
            tree.append({
                "name": entry.name,
                "type": "file"
            })
    return tree

def cleanup_empty_notes(path=NOTES_ROOT):
    """
    Recursively remove empty files older than a certain threshold
    and empty directories.
    """
    now = time.time()
    for root, dirs, files in os.walk(path, topdown=False):
        # Remove empty files older than threshold
        for f in files:
            full_path = os.path.join(root, f)
            try:
                if os.path.getsize(full_path) == 0:
                    age = now - os.path.getmtime(full_path)
                    if age > EMPTY_FILE_AGE_THRESHOLD:
                        os.remove(full_path)
                        print(f"🗑️ Removed empty file: {full_path}")
            except FileNotFoundError:
                continue

        # Remove empty directories
        for d in dirs:
            full_dir = os.path.join(root, d)
            try:
                if not os.listdir(full_dir):
                    os.rmdir(full_dir)
                    print(f"🗑️ Removed empty folder: {full_dir}")
            except FileNotFoundError:
                continue



@app.route("/api/notes")
async def filelist():
    full_path = os.path.abspath("static/notes")
    tree = build_file_tree(full_path)
    return jsonify(tree)

@app.get("/api/metadata/all")
def get_all_metadata():
    """
    Return all metadata for all files.
    """
    all_meta = store.get_all_metadata()
    return JSONResponse(content=all_meta)

@app.route('/api/metadata', defaults={'filename': None}, methods=['GET'])
@app.route('/api/metadata/<path:filename>', methods=['GET'])
async def api_metadata(filename):
    """
    Returns metadata for all files if no filename is provided,
    or metadata for a specific file if the filename is in the URL.
    """
    if filename:
        # Return metadata for a single file
        metadata = store.get_metadata(filename)
        if not metadata:
            return jsonify({"error": f"Metadata not found for file: {filename}"}), 404
        return jsonify(metadata), 200
    else:
        # Return all metadata
        all_metadata = store.get_all_metadata()
        return jsonify(all_metadata), 200

@app.route('/api/search')
async def api_search():
    query = request.args.get('q', '')
    field = request.args.get('field', None)
    tag = request.args.get('tag', None)
    has_tasks = request.args.get('has_tasks', None)
    if has_tasks is not None:
        has_tasks = has_tasks.lower() == 'true'

    results = store.search_combined_with_snippets(query)
    return jsonify(results)

@app.route('/api/query', methods=['POST'])
async def api_query():
    """query metadata for filtering"""
    
    body = await request.get_json()
    if not body:
        return jsonify({"error": "No JSON body provided"}), 400
    log.debug(body)
    result = store.query(body["query"])
    return result 

@app.route("/notes/<path:filename>", methods=['GET', 'POST'])
async def notes(filename):
    file_path = (NOTES_ROOT / filename).with_suffix(".md").resolve(strict=False)
    if not file_path.resolve().is_relative_to(NOTES_ROOT):
        return "Forbidden", 403
    save_path = f"static/notes/{filename}.md"
    log.debug(f"file_path is: {save_path}")

    if request.method == "GET":
        try:
            with open(save_path) as f:
                data = f.read()
        except FileNotFoundError:
            return ""
        return data, 200, {"Content-Type": "text/markdown; charset=utf-8"}

    if request.method == "POST":
        helper.ensure_file_exists(save_path)

        body = await request.get_data()
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(body.decode("utf-8"))

        return jsonify({'message': f'File {filename} uploaded successfully.'}), 201

    return jsonify({'message': f'Something when wrong while saving {filename}.'}), 500

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
async def catch_all(path):
    print(f"inside catchall, path: {path}")
    if path.startswith("notes/") or path.startswith("api/"):
        return "Not Found", 404

    static_path = os.path.join("static", path)
    if os.path.exists(static_path) and not os.path.isdir(static_path):
        return await send_from_directory("static", path)

    return await render_template("index.html")


async def periodic_cleanup():
    cleanup_empty_notes()
    while True:
        cleanup_empty_notes()
        await asyncio.sleep(600)

async def main():
    await asyncio.gather(
        app.run_task(host="0.0.0.0", port=11624),
        start_yjs_server(host="0.0.0.0", port=11625), 
        periodic_cleanup(),
    )

if __name__ == "__main__":
    asyncio.run(main())