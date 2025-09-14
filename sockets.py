import json
from collab_state import DocumentStore
import traceback
from logger import log, Logger
doc_store = DocumentStore("doc.db")
class WebSocketHandler:
    def __init__(self, ws, clients):
        self.ws = ws
        self.user_id = None 
        self.joined_docs = set()
        self.doc_versions = {}  # Tracks current version per joined doc
        self.clients = clients  # Global/shared clients dict
        self.log = Logger("WebsocketHandler")
        self.log(f"User ID: {self.user_id}")

        self.dispatch = {
            "joinDoc": self.handle_join_doc,
            "updates": self.handle_updates,
            "resync-request": self.handle_resync_request,
            "leaveDoc": self.handle_leave_doc,
        }

    def run(self):
        try:
            while True:
                data = self.ws.receive()
                if data is None:
                    break
                try:
                    message = json.loads(data)
                except json.JSONDecodeError:
                    self.log(f"❌ Invalid JSON received: {data}")
                    continue

                msg_type = message.get("type")
                self.user_id = message.get("user_id", None)
                self.log(f"User id = {self.user_id}")
                self.log(f"📨 Message type: {msg_type}")
                handler = self.dispatch.get(msg_type)

                if handler:
                    handler(message)
                else:
                    self.log("⚠️ Unknown message:", message)

        except Exception as e:
            self.log(f"⚠️ WebSocket error ({self.user_id}): {e}\n {traceback.print_exc()}")
        finally:
            self.cleanup()

    def cleanup(self):
        self.log(f"🔌 Disconnect: {self.user_id}")
        for doc_id in self.joined_docs:
            if doc_id in self.clients and self.ws in self.clients[doc_id]:
                self.clients[doc_id].remove(self.ws)
                self.log(f"🔄 Removed {self.user_id} from {doc_id}")

    def handle_join_doc(self, message):
        doc_id = message.get("doc")
        if not doc_id:
            self.log("⚠️ joinDoc missing 'doc' field")
            return

        if doc_id in self.joined_docs:
            self.log(f"🔁 {self.user_id} already joined {doc_id}")
            return

        self.joined_docs.add(doc_id)
        self.clients.setdefault(doc_id, []).append(self.ws)
        

        self.log(f"✅ Client {self.user_id} joined doc {doc_id}")

        version = self.send_init_for_doc(doc_id)
        if version:
            self.doc_versions[doc_id] = version
    def handle_leave_doc(self, message):
        doc_id = message.get("doc")
        if not doc_id:
            self.log("⚠️ leaveDoc missing 'doc' field")
            return

        if doc_id in self.joined_docs:
            self.joined_docs.remove(doc_id)
            self.doc_versions.pop(doc_id, None)
            if doc_id in self.clients and self.ws in self.clients[doc_id]:
                self.clients[doc_id].remove(self.ws)
                self.log(f"🚪 Client {self.user_id} left doc {doc_id}")
                if not self.clients[doc_id]:
                    del self.clients[doc_id]
        else:
            self.log(f"⚠️ Client {self.user_id} not in doc {doc_id}")

    def handle_updates(self, message):
        doc_id = message.get("doc")
        if doc_id not in self.joined_docs:
            self.log(f"⚠️ Updates received for unjoined doc {doc_id}")
            return

        updates = message.get("updates", [])
        client_version = message.get("version")
        server_version = doc_store.get_version(doc_id)
        if client_version < server_version:
            self.log(f"client version({client_version}) lower than server version({server_version})")
            missing_updates = doc_store.get_updates_since(doc_id, client_version)
            #self.send({
            #    "type": "updates",
            #    "doc": doc_id,
            #    "updates": missing_updates,
            #    "version": server_version
            #})
            self.send_init_for_doc(doc_id)
            return

        if client_version > server_version + 1:
            self.log(f"client version({client_version}) higher than server version({server_version})")
            full_updates = doc_store.get_all_updates_for_doc(doc_id)
            if not full_updates:
                raw_text = doc_store.get_document_text(doc_id)
                if raw_text:
                    full_updates = self.create_full_doc_update(raw_text)
                    server_version = 1
            self.send({
                "type": "init",
                "doc": doc_id,
                "updates": full_updates,
                "version": server_version
            })
            return

        self.log(f"client version({client_version}) == server version({server_version})")
        self.log(updates)
        doc_store.store_updates(doc_id, self.user_id, updates)
        new_version = doc_store.get_version(doc_id)
        self.doc_versions[doc_id] = new_version

        broadcast_data = {
            "type": "updates",
            "doc": doc_id,
            "updates": updates,
            "version": new_version,
            "user": self.user_id
        }

        

        #self.log(f"updates for file {doc_id}: {doc_store.get_all_updates_for_doc(doc_id)}")
        broadcast_list = self.clients.get(doc_id, [])
        self.broadcast(broadcast_list,broadcast_data)

        # save file
        #doc_store.rebuild_and_save_document(doc_id)
        text = doc_store.reconstruct_document(doc_id)
        

    def handle_resync_request(self, message):
        doc_id = message.get("doc")
        if doc_id not in self.joined_docs:
            self.log(f"⚠️ Resync requested for unjoined doc {doc_id}")
            return
        
        
        raw_text = doc_store.get_document_text(doc_id)
        
        full_updates = self.create_full_doc_update(raw_text)
        current_version = 1
        mode = "single" if len(self.clients[doc_id]) == 1 else "collaborative"
        mode = "collaborative"
        self.send_init_for_doc(doc_id)
        #self.send({
        #    "type": "init",
        #    "doc": doc_id,
        #    "updates": full_updates,
        #    "mode": mode,
        #    "version": current_version
        #})
        self.doc_versions[doc_id] = current_version

    def send_init_for_doc(self, doc_id):
        try:
            raw_text = doc_store.get_document_text(doc_id)
            full_updates = self.create_full_doc_update(raw_text)
            self.log(f"full updates: {full_updates}")
            server_version = doc_store.get_version(doc_id)
            mode = "single" if len(self.clients[doc_id]) == 1 else "collaborative"
            mode = "collaborative"
            self.log(f"Mode for this document is: {mode}")
            base = {
                "type": "init",
                "doc": doc_id,
                "clientID": "system",
                "mode": mode
            }

            if mode == "single":
                base.update({
                    "text": raw_text
                })
            else:
                base.update({
                    "updates": full_updates,
                    "version": server_version
                    })
            
            broadcast_list = self.clients.get(doc_id, [])
            self.broadcast(broadcast_list, base, False)
            return server_version
        except Exception as e:
            self.log(f"❌ Failed to send init data for doc {doc_id}: {e}")
            return None

    def create_full_doc_update(self, full_text: str):
        return [{
            "changes": [[0, full_text]],
            "clientID": "system"
        }]

    def send(self, payload: dict):
        try:
            self.ws.send(json.dumps(payload))
        except Exception as e:
            self.log(f"❌ Failed to send message: {e}")

    def broadcast(self, clientlist, payload: dict, exclude_sender=False):
        message = json.dumps(payload)
        for client in clientlist:
            if exclude_sender and client == self.ws:
                continue
            try:
                client.send(message)
            except Exception as e:
                self.log(f"❌ Broadcast error: {e}")
