
from flask import Flask, render_template, send_from_directory, request, jsonify
from time import sleep
import os, subprocess, json, shutil
from datetime import date
from flask_compress import Compress
import traceback

from flask_sock import Sock
from urllib.parse import parse_qs


import metadata
import db
from collab_state import DocumentStore 
from sockets import WebSocketHandler

NOTES_DIR = 'static/notes'

db.init_db()
db.load_all_notes(NOTES_DIR, parser=metadata.parse_markdown_file)

app = Flask(__name__)
Compress(app)
websockets = Sock(app)

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
            tree.append({
                "name": entry.name,
                "type": "file"
            })
    return tree

def ensure_file_exists(path: str):
    # Ensure parent directories exist
    dir_name = os.path.dirname(path)
    if dir_name and not os.path.exists(dir_name):
        os.makedirs(dir_name)

    # Ensure the file exists
    if not os.path.exists(path):
        with open(path, 'w') as f:
            pass  # Create an empty file

@app.route("/")
def main():
    return render_template("index.html")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def catch_all(path):
    # 1. Let Flask handle API/backend routes
    
    if path.startswith("notes/") or path.startswith("api/"):
        return "Not Found", 404

    # 2. Serve static files (e.g. main.js, styles.css, etc.)
    static_path = os.path.join("static", path)
    if os.path.exists(static_path) and not os.path.isdir(static_path):
        return send_from_directory("static", path)

    # 3. Otherwise, serve index.html to let frontend handle routing
    return render_template("index.html")

@app.route("/api/notes")
def filelist():
    full_path = os.path.abspath("static/notes")
    tree = build_file_tree(full_path)
    return jsonify(tree)


@app.route('/api/metadata/<path:filename>')
def api_get_metadata(filename):
    md = db.get_metadata(filename)

    return jsonify(md)

@app.route('/api/search')
def api_search():
    q = request.args.get('q', '')
    field = request.args.get('field', None)  # e.g. filename, tags, content
    tag = request.args.get('tag', None)      # filter by tag name
    has_tasks = request.args.get('has_tasks', None)
    if has_tasks is not None:
        has_tasks = has_tasks.lower() == 'true'

    results = db.search(q, field=field, tag=tag, has_tasks=has_tasks)
    return jsonify(results)

@app.route("/notes/<path:filename>", methods = ['GET', 'POST'])
def notes(filename):
    save_path = f"static/notes/{filename}.md"
    
    if request.method == "GET":
        try:
            with open(save_path) as f:
                data = f.read()
        except FileNotFoundError:
            ensure_file_exists(save_path)
            with open(save_path) as f:
                data = f.read()

            #return "File not found", 404
        return data
    if request.method == "POST":
        today = date.today()      
        ensure_file_exists(save_path)

        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(request.data.decode("utf-8"))

        try:
            metadata_obj, content = metadata.parse_markdown_file(save_path)
            #db.save_file_metadata(filename, metadata_obj, content, "metadata.db")
            db.save_file(filename, content, metadata_obj)
        except Exception as e:
            traceback.print_exc()
            raise Exception
            return jsonify({'error': f'Failed to parse and save metadata: {str(e)}'}), 500

        return jsonify({'message': f'File {filename} uploaded and indexed successfully.', "metadata": db.get_metadata(filename)}), 201
    return "failed", 500

### WEBSOCKETS ###
clients = {}
active_docs = {}
doc_id = None
@websockets.route('/ws')
def handle_ws(ws):
    query = parse_qs(request.query_string.decode())
    #print(f"📡 WebSocket connect: user={user_id}")

    handler = WebSocketHandler(ws, clients)
    handler.run()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=11624, debug=True)

