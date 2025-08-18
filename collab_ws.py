# collab_ws.py  -- updated: online-first with persisted CRDT store + one-time file import
import asyncio
import uvicorn
import os
import aiofiles
from watchfiles import awatch
from pycrdt import Doc, YMessageType, Text
from pycrdt.websocket import ASGIServer, WebsocketServer, YRoom
from pycrdt.store import SQLiteYStore
from logger import Logger, Logging

Logging.enable_namespace("crdts")
log = Logger("crdts")

NOTES_DIR = "static/notes/"

class SnapshotRoom(YRoom):
    def __init__(self, name, ready, store_path="doc_store.sqlite", save_interval=0):
        # Use persistent store so CRDT update history survives restarts
        super().__init__(
            ystore=SQLiteYStore(path=store_path),
            ready=ready,
        )


        self.name = name
        self.path = os.path.join(NOTES_DIR, name)
        if not self.path.endswith(".md"):
            self.path += ".md"

        # Keep original on_message if present
        self._original_on_message = self.on_message or (lambda msg: False)
        self.on_message = self._my_on_message_override

        self.save_counter = 0
        self.save_interval = save_interval

        # New: for detecting external changes
        self._watch_task = None

        log(f"Initialised SnapshotRoom for '{name}' (store={store_path})")

    async def prepare(self):
        log("preparing room")

        # Start store in background, don't await because it blocks forever
        if not hasattr(self, "_ystore_task") or self._ystore_task.done():
            self._ystore_task = asyncio.create_task(self.ystore.start())

        # Wait for DB initialization event (store ready)
        await self.ystore.started.wait()
        log("Storage initialised")
        # Now safe to read and apply updates
        await self.read_updates()
        log("Updates read")

        #await self.load_file_into_ydoc()
        log("File loaded")

        # Start file watcher in background
        if self._watch_task is None:
            self._watch_task = asyncio.create_task(self._watch_file_changes())
            log(f"Started background file watcher for '{self.path}'")

    async def _watch_file_changes(self):
        async for changes in awatch(self.path):
            # Schedule CRDT merge safely on the current loop
            asyncio.get_event_loop().create_task(self._merge_file_changes())


    async def _merge_file_changes(self):
        """Read file content and merge into ydoc."""
        try:
            async with aiofiles.open(self.path, 'r') as f:
                new_content = await f.read()
            ytext = self.ydoc.get(self.name, type=Text)
            current_content = ytext.to_py()

            if new_content != current_content:
                # simple merge strategy: insert diff at start (or implement smarter merge)
                log(f"Merging {len(new_content)} bytes from disk into ydoc")
                # naive approach: replace all content
                #ytext.delete(0, len(current_content))
                ytext.clear()
                ytext.insert(0, new_content)
        except Exception as e:
            log(f"Error merging external file changes: {e}")

    async def read_updates(self):
        try:
            async for update, metadata, timestamp in self.ystore.read():
                self.ydoc.apply_update(update)
        except:
            # no updates yet
            pass

    async def save_document(self, text):
        if len(text) == 0:
            return
        if self.save_counter >= self.save_interval:
            async with aiofiles.open(self.path, 'w') as f:
                await f.write(text)
                
            self.save_counter = 0
        else:
            self.save_counter += 1

    async def _my_on_message_override(self, message: bytes) -> bool:
        # keep prior behavior, then save to file on message
        result = self._original_on_message(message)
        text = self.ydoc.get(self.name, type=Text).to_py()
        await self.save_document(text)
        return result

    async def load_file_into_ydoc(self):
        """
        Load file contents into self.ydoc *only if the doc is empty*.
        This function does NOT clear an existing persisted CRDT history.
        """
        ytext = self.ydoc.get(self.name, type=Text)
        # If the doc already has content (from the persistent store), skip file import
        if len(ytext.to_py()) > 0:
            log(f"Doc for '{self.path}' already has persisted CRDT content, skipping file import")
            return False

        # Otherwise, import the file content once (initial import)
        try:
            log(f"Loading {self.path} from disk into Y.Doc (initial import)")
            async with aiofiles.open(self.path, 'r') as f:
                content = await f.read()

            if content:
                ytext.insert(0, content)
                log(f"Loaded file '{self.path}' into ydoc (initial import). length={len(content)}")
            else:
                log(f"File '{self.path}' empty — created empty document")

            # Try to persist this initial import into the ystore so subsequent server restarts
            # restore the same CRDT history instead of re-importing file again.
            try:
                # many Y/py bindings expose an encode_state_as_update() or similar
                update_bytes = None
                if hasattr(self.ydoc, "encode_state_as_update"):
                    update_bytes = self.ydoc.encode_state_as_update()
                elif hasattr(self.ydoc, "encode_state_as_update_v1"):
                    update_bytes = self.ydoc.encode_state_as_update_v1()
                # If we have update bytes and a store with write(), persist it
                if update_bytes and getattr(self, "ystore", None) is not None:
                    # SQLiteYStore.write(ydoc, data) signature used by SnapshotStorage above
                    try:
                        await self.ystore.write(self.ydoc, update_bytes)
                        log(f"Persisted initial import into Y-store for '{self.name}'")
                    except TypeError:
                        # If write expects only bytes, or different signature, try fallback
                        try:
                            await self.ystore.write(update_bytes)
                            log(f"Persisted initial import into Y-store (fallback signature) for '{self.name}'")
                        except Exception as e:
                            log(f"Could not persist initial update via ystore.write fallback: {e}")
                else:
                    log("No update encoder found or no ystore available — initial import may not be persisted automatically.")
            except Exception as e:
                log(f"Error while trying to persist initial import into ystore: {e}")

            return True
        except FileNotFoundError:
            log(f"File '{self.path}' not found — starting with empty document")
            return False
        except Exception as e:
            log(f"Error loading file '{self.path}': {e}")
            return False


class SnapshotServer(WebsocketServer):
    async def get_room(self, name: str) -> SnapshotRoom:
        name = "/".join(name.split("/")[2:])
        if name not in self.rooms.keys():
            log("NEW ROOM")
            room = SnapshotRoom(name=name, ready=self.rooms_ready)
            log("Starting prep")
            await room.prepare()
            log("Finished prep")
            self.rooms[name] = room
        room = self.rooms[name]
        await self.start_room(room)
        return room


async def start_yjs_server(host="0.0.0.0", port=11625):
    websocket_server = SnapshotServer(rooms_ready=True, auto_clean_rooms=True)
    app = ASGIServer(websocket_server)
    config = uvicorn.Config(app, host=host, port=port)
    server = uvicorn.Server(config)
    log(f"Starting Uvicorn with app: {app}")
    async with websocket_server:
        await server.serve()
