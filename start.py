import os
import traceback
from datetime import date
from urllib.parse import parse_qs
import asyncio
import json

from quart import Quart, render_template, request, jsonify, send_from_directory, websocket
from quart_compress import Compress


from logger import Logger, Logging
log = Logger("main")

from collab_ws import start_yjs_server
from metadatastore import MetadataStore
NOTES_DIR = 'static/notes'

app = Quart(__name__)
Compress(app)
store = MetadataStore()
os.chdir("/home/jamiro/code/vantagenotes/")


def ensure_file_exists(path: str):
    # Ensure parent directories exist
    dir_name = os.path.dirname(path)
    if dir_name and not os.path.exists(dir_name):
        os.makedirs(dir_name)

    # Ensure the file exists
    if not os.path.exists(path):
        with open(path, 'w') as f:
            pass  # Create an empty file

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
    save_path = f"static/notes/{filename}.md"

    if request.method == "GET":
        try:
            with open(save_path) as f:
                data = f.read()
        except FileNotFoundError:
            ensure_file_exists(save_path)
            with open(save_path) as f:
                data = f.read()
        return data

    if request.method == "POST":
        ensure_file_exists(save_path)

        body = await request.get_data()
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(body.decode("utf-8"))

        return jsonify({'message': f'File {filename} uploaded successfully.'}), 201

    return jsonify({'message': f'Something when wrong while saving {filename}.'}), 500


async def main():
    await asyncio.gather(
        app.run_task(host="0.0.0.0", port=11624),
        start_yjs_server(host="0.0.0.0", port=11625, store=store), 
    )

if __name__ == "__main__":
    asyncio.run(main())
