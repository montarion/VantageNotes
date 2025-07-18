
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
            #ensure_file_exists(save_path)
            #with open(save_path, 'w', encoding='utf-8') as f:
            #    f.write(request.data.decode("utf-8"))

            return "File not found", 404
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

@websockets.route('/ws')
def handle_ws(ws):
    query = parse_qs(request.query_string.decode())
    doc_id = query.get("doc", [""])[0]
    user_id = query.get("user", ["unknown"])[0]

    print(f"📡 WebSocket connect: doc={doc_id}, user={user_id}")

    # Track clients per doc
    if doc_id not in clients:
        clients[doc_id] = []
    clients[doc_id].append(ws)

    def create_full_doc_update(full_text: str):
        # Adapt this to your update format expected by client
        return {
            "type": "full-replace",
            "content": full_text
        }

    def send_init_for_doc(doc):
        try:
            full_updates = doc_store.get_all_updates_for_doc(doc)
            current_version = doc_store.get_version(doc)

            # If no updates but doc text exists, create a synthetic full update
            if not full_updates:
                raw_text = doc_store.get_document_text(doc)
                if raw_text:
                    print("⚠️ No updates found but document text exists, creating full document update")
                    full_updates = [create_full_doc_update(raw_text)]
                    current_version = 1
                    # Optionally store this synthetic update for persistence/versioning
                    doc_store.store_updates(doc, "system", full_updates)

            initmsg = json.dumps({
                "type": "init",
                "updates": full_updates,
                "version": current_version
            })
            print(f"Initmsg for doc {doc}: {initmsg}")
            ws.send(initmsg)
            return current_version
        except Exception as e:
            print(f"❌ Failed to send init data for doc {doc}: {e}")
            return None

    current_version = send_init_for_doc(doc_id)

    try:
        while True:
            data = ws.receive()
            if data is None:
                break

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                print(f"❌ Invalid JSON received: {data}")
                continue

            msg_type = message.get("type")

            if msg_type == "switchDoc":
                new_doc_id = message.get("doc")
                if not new_doc_id:
                    print("⚠️ switchDoc missing 'doc' field")
                    continue

                # Remove ws from old doc clients list
                if doc_id in clients and ws in clients[doc_id]:
                    clients[doc_id].remove(ws)
                    print(f"🔄 Client {user_id} left doc {doc_id}")

                    # Clean up empty client list for old doc if needed
                    if len(clients[doc_id]) == 0:
                        del clients[doc_id]

                # Add ws to new doc clients list
                doc_id = new_doc_id
                if doc_id not in clients:
                    clients[doc_id] = []
                clients[doc_id].append(ws)
                print(f"🔄 Client {user_id} switched to doc {doc_id}")

                # Send full init updates for new doc
                current_version = send_init_for_doc(doc_id)

            elif msg_type == "updates":
                updates = message.get("updates", [])
                print(f"✅ Received {len(updates)} updates from client {user_id} on doc {doc_id}")
                client_version = message.get("version")
                server_version = doc_store.get_version(doc_id)

                if client_version != server_version:
                    print(f"⚠️ Version mismatch: client={client_version}, server={server_version}")
                    full_updates = doc_store.get_all_updates_for_doc(doc_id)

                    # Same logic here in case no incremental updates:
                    if not full_updates:
                        raw_text = doc_store.get_document_text(doc_id)
                        if raw_text:
                            full_updates = [create_full_doc_update(raw_text)]
                            server_version = 1

                    ws.send(json.dumps({
                        "type": "init",
                        "updates": full_updates,
                        "version": server_version
                    }))
                    continue  # Skip out-of-sync updates

                doc_store.store_updates(doc_id, user_id, updates)
                new_version = doc_store.get_version(doc_id)

                broadcast_data = json.dumps({
                    "type": "updates",
                    "updates": updates,
                    "version": new_version,
                    "user": user_id
                })
                print(f"✅ Stored updates from {user_id} on doc {doc_id} — new server version: {new_version}")

                # Broadcast to all other clients of the same doc
                for client in clients.get(doc_id, []):
                    if client != ws:
                        try:
                            client.send(broadcast_data)
                        except Exception as e:
                            print(f"❌ Broadcast error: {e}")

            elif msg_type == "resync-request":
                print(f"🔁 Resync requested by {user_id} on doc {doc_id}")
                full_updates = doc_store.get_all_updates_for_doc(doc_id)
                current_version = doc_store.get_version(doc_id)

                # Same logic for no updates on resync
                if not full_updates:
                    raw_text = doc_store.get_document_text(doc_id)
                    if raw_text:
                        full_updates = [create_full_doc_update(raw_text)]
                        current_version = 1

                ws.send(json.dumps({
                    "type": "init",
                    "updates": full_updates,
                    "version": current_version
                }))

            else:
                print("⚠️ Unrecognized message:", message)

    except Exception as e:
        print(f"⚠️ WebSocket error ({user_id}): {e}")
    finally:
        print(f"🔌 Disconnect: {user_id} from {doc_id}")
        if doc_id in clients and ws in clients[doc_id]:
            clients[doc_id].remove(ws)



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=11624, debug=True)

