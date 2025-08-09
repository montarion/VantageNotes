# collab_ws.py
import asyncio
import uvicorn
import os
import inspect
import aiofiles
from pycrdt import Doc, YMessageType, Text
from pycrdt.websocket import ASGIServer, WebsocketServer, YRoom
from pycrdt.store import SQLiteYStore  # or FileStore if you prefer
from logger import Logger, Logging

Logging.enable_namespace("crdts")
log = Logger("crdts")

NOTES_DIR = "static/notes/"
class SnapshotStorage(SQLiteYStore):
    def __init__(self, path="doc_store.sqlite", snapshot_dir="snapshots"):
        super().__init__(path)
        log("storage initialised")
        self.snapshot_dir = snapshot_dir
        os.makedirs(snapshot_dir, exist_ok=True)

    async def write(self, ydoc: Doc, data: bytes):
        # First, store the update in SQLite
        await super().write(data)
        # Then rebuild the doc from all stored updates and save snapshot
        await self.apply_updates(ydoc)

    async def apply_updates(self, ydoc: Doc) -> None:
        """Apply all stored updates to the YDoc."""
        log(f"Applying stored updates to YDoc: {ydoc}")
        async for update, *rest in self.read():
            ydoc.apply_update(update)
        ytext = ydoc.get("codemirror", type=Text)
        log(f"Current contents: {ytext.to_py()}")

    async def _save_snapshot(self):
        doc = Doc()
        async for update, *_ in self.read():
            doc.apply_update(update)
        return doc  # now you can inspect or serialize it


class SnapshotRoom(YRoom):
    def __init__(self, name, ready, store_path="doc_store.sqlite", snapshot_dir="snapshots", save_interval=10):
        super().__init__(
            ystore=None,
            #ystore=SQLiteYStore(path=store_path),
            #ystore=SnapshotStorage(store_path, snapshot_dir),
            ready=ready,
        )
        self.name = name
        self.path = os.path.join(NOTES_DIR, name)
        if not self.path[-3:] == ".md":
            self.path+=".md"
        # Save the original on_message callable if set, else fallback to a no-op
        self._original_on_message = self.on_message or (lambda msg: False)

        # Override on_message with your own method or wrapper
        self.on_message = self._my_on_message_override
        self.save_counter = 0
        self.save_interval = save_interval
        log(f"Initialised SnapshotRoom for '{name}'")

    async def save_document(self, text):
        if len(text) == 0:
            return
        if self.save_counter >= self.save_interval:
            async with aiofiles.open(self.path, 'w') as f:
                await f.write(text)
            self.save_counter = 0
            log(f"Saved {self.name}.")
        else:
            self.save_counter += 1

    async def _my_on_message_override(self, message:bytes) -> bool:
        result =  self._original_on_message(message)
        text = self.ydoc.get("codemirror", type=Text).to_py()
        await self.save_document(text)
        return result

    async def load_file_into_ydoc(self):
        try:
            ytext = self.ydoc.get("codemirror", type=Text)
            if len(ytext.to_py()) > 0:
                log(f"Ydoc already has content, skipping file load for '{self.path}'")
                return
                
            async with aiofiles.open(self.path, 'r') as f:
                content = await f.read()
            
            # Clear any existing content before inserting
            ytext.clear()
            ytext.insert(0, content)
            log(f"Loaded file '{self.path}' into ydoc")
        except FileNotFoundError:
            log(f"File '{self.path}' not found, starting with empty document")
        except Exception as e:
            log(f"Error loading file '{self.path}': {e}")

class SnapshotServer(WebsocketServer):
    async def get_room(self, name: str) -> SnapshotRoom:
        name = "/".join(name.split("/")[2:])
        if name not in self.rooms.keys():
            room = SnapshotRoom(name=name, ready=self.rooms_ready)
            await room.load_file_into_ydoc()  # load file content into ydoc here!
            self.rooms[name] = room
        room = self.rooms[name]
        await self.start_room(room)
        return room


async def start_yjs_server(host="0.0.0.0", port=11625):
    websocket_server = SnapshotServer(rooms_ready=True, auto_clean_rooms=True,)
    app = ASGIServer(websocket_server)
    config = uvicorn.Config(app, host=host, port=port)
    server = uvicorn.Server(config)
    log(f"Starting Uvicorn with app: {app}")
    async with websocket_server:
        await server.serve()
