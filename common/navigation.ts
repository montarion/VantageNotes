import { CMEditor } from "./editor";
import { Logger } from "./logger.ts";
import { setLS, getLS, Note} from "./helpers.ts";
import { frontmatterField } from "../cm/frontmatterPlugin.ts";

const log = new Logger({namespace: 'Navigation'})
type NoteNode = {
    name: string;
    type: "file" | "folder";
    children?: NoteNode[];
  };
export class Navigation {
  private editor?: CMEditor;
  notesTree: any[] = [];
  notesMap: Record<string, Note> = {};
  
  
  //notes: NoteNode[] = [];

  notes: Note[] = []
  navdiv = document.querySelector("nav") as HTMLElement;
  sidediv = document.querySelector("#sidebar") as HTMLElement;

  /**
   * Attach an editor instance to this navigation controller
   */
  setEditor(editor: CMEditor) {
    this.editor = editor;
  }

  // ────────────── Panel controls ──────────────

  showNavigation() {
    this.updateFileList()
    if (this.navdiv) {
      this.navdiv.style.flexGrow = "1";
      this.navdiv.style.minWidth = "200px"
    }
  }

  populateNavigation() {
    if (!this.navdiv) return;
    this.navdiv.innerHTML = "";
  
    const buildNode = (node: any, container: HTMLElement, parentPath = "") => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  
      const item = document.createElement("div");
      item.className = node.type === "folder" ? "folder-item" : "file-item";
      item.textContent = node.name.endsWith(".md") ? node.name.slice(0, -3) : node.name;
  
      if (node.type === "file") {
        item.addEventListener("click", async () => {
          const note = this.notesMap[fullPath];
          if (note) await this.switchTab(note.path);
        });
      } else if (node.type === "folder" && node.children) {
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "folder-children";
        childrenContainer.style.paddingLeft = "1rem";
  
        node.children.forEach(child => buildNode(child, childrenContainer, fullPath));
  
        item.appendChild(childrenContainer);
  
        // collapsible
        item.addEventListener("click", () => {
          const visible = childrenContainer.style.display !== "none";
          childrenContainer.style.display = visible ? "none" : "block";
        });
      }
  
      container.appendChild(item);
    };
  
    this.notesTree.forEach(node => buildNode(node, this.navdiv));
  }
  

  closeNavigation() {
    if (this.navdiv){
      this.navdiv.style.flexGrow = "0";
      this.navdiv.style.minWidth = "0px"
    }
  }

  showSidebar() {
    if (this.sidediv){
      this.sidediv.style.flexGrow = "1";
      this.sidediv.style.minWidth = "200px";
    }
  }

  closeSidebar() {
    if (this.sidediv){
      this.sidediv.style.flexGrow = "0";
      this.sidediv.style.minWidth = "0px";
    }  }

  // ────────────── File management ──────────────

  flattenTree(nodes: any[], parentPath = ""): any[] {
    let out: any[] = [];
    log.debug(nodes)
    for (const node of nodes) {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.type === "folder") {
        out.push({ ...node, path: fullPath, type: "folder" });
        if (node.children) {
          out.push(...this.flattenTree(node.children, fullPath));
        }
      } else if (node.type === "file") {
        out.push({ ...node, path: fullPath, type: "file" });
      }
    }
    return out;
  }
  /**
   * Fetch list of files/notes from server
   */
  async updateFileList() {
    const url = "/api/notes";
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Response status: ${response.status}`);
      const result = await response.json();
  
      // keep the tree for rendering
      this.notesTree = result;
  
      // flatten for lookup
      this.notesMap = {};
      const flatNotes = this.flattenTree(result);
      flatNotes.forEach(raw => {
        const note: Note = {
          path: raw.path,
          id: undefined,
          title: raw.name.endsWith(".md") ? raw.name.slice(0, -3) : raw.name,
          frontmatter: undefined,
          dirty: false,
          lastLoadedAt: undefined,
        };
        this.notesMap[note.path] = note;
      });
  
      // render using tree
      this.populateNavigation();
  
      return result;
    } catch (err: any) {
      console.error(err.message);
      return {};
    }
  }
  /**
   * Get file from server, via cache(TODO)
   * @param filename name of markdown file to fetch. full path, relative to root (e.g. [/notes/]folder/filename)
   */
  async getFile(filename:string){
    log.debug(typeof(filename))
    if (filename.endsWith(".md")) {
        filename = filename.slice(0, -3)
    }
    const url = "/notes/"+filename;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Response status: ${response.status}`);
      const result = await response.text();
      return result;
    } catch (err: any) {
      console.error(err.message);
      return {};
    }
  }
  /**
   * Load file content into the editor
   */
  async loadFile(filename: string) {
    if (!this.editor) {
      console.warn("Editor not set!");
      return;
    }
  
    if (filename.endsWith(".md")) {
      filename = filename.slice(0, -3);
    }
  
    const content = await this.getFile(filename);
    this.editor.resetEditor(content)
    this.editor?.setValue(filename, content)
    // Use editor's bindCollaboration to load Yjs-backed note
    await this.editor.bindCollaboration(filename, content);
  }

  /**
   * Save current editor content to server
   */
  async saveFile(fileId: string) {
    if (!this.editor) {
      console.warn("Editor not set!");
      return;
    }
    const content = this.editor.getValue();
    try {
      const response = await fetch(`/api/notes/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(`Save failed: ${response.status}`);
      console.log(`File ${fileId} saved successfully`);
    } catch (err: any) {
      console.error(err.message);
    }
  }

  // ────────────── Tab management ──────────────

  /**
   * Switch tab by filename, creating a new one if needed
   */
  async switchTab(filename: string) {
    if (filename.endsWith(".md")) filename=filename.slice(0,-3)
    setLS("lastTab", filename);
    this.setTabInPath(filename);
  
    // Find existing note or create new
    let note = this.notes.find(n => n.path === filename);
    if (!note) {
      note = {
        path: filename,
        id: undefined,
        title: filename.split("/").pop(),
        frontmatter: undefined,
        dirty: false,
        lastLoadedAt: Date.now(),
      };
      this.notes.push(note);
    }
  
    await this.loadFileIntoEditor(note);
  }
  private async loadFileIntoEditor(note: Note) {
    if (!this.editor) {
      console.warn("Editor not set!");
      return;
    }
  
    let content = await this.getFile(note.path);
    if (typeof content !== "string") content = "";
  
    this.editor.resetEditor(content);
    this.editor.setValue(note.path, content);
    await this.editor.bindCollaboration(note.path, content);
  
    // parse frontmatter
    const fm = this.editor.view.state.field(frontmatterField);
    if (fm?.exists) {
      note.frontmatter = fm.data;
      if (fm.data?.id) note.id = fm.data.id;
      if (fm.data?.title) note.title = fm.data.title;
    }
  
    note.lastLoadedAt = Date.now();
    note.dirty = false;
    log.debug(`Note loaded: `, note)
  }

  /**
   * Close the current tab
   */
  closeTab(fileId: string) {
    delete this.notes[fileId];
    this.switchTab(""); // fallback to empty editor
  }

  async loadLastTab() {
    const fromPath = this.getTabFromPath();
    const fromLS = getLS<string>("lastTab");
  
    const tab = fromPath ?? fromLS;
    if (tab) {
      await this.switchTab(tab);
    }
  }


  // ────────────── Path helpers ──────────────

  private getTabFromPath(): string | null {
    // "/folder/filename" → "folder/filename"
    const path = window.location.pathname;
    const clean = path.replace(/^\/+/, "");

    return clean || null;
  }

  private setTabInPath(filename: string) {
    const clean = filename.replace(/^\/+/, "");
    const url = "/" + clean;

    history.pushState({}, "", url);
  }
}

