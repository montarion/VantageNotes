import { YjsEditor } from "./editor.ts";
import { Logger } from "./logger.ts";
import { getLS, Note, setLS } from "./helpers.ts";
import { MetadataExtractor } from "./metadata.ts";
import { Sidebar } from "./sidebar.ts";
import { getApp } from "./app.ts";

const log = new Logger({ namespace: "Navigation" });

type NoteNode = {
  name: string;
  type: "file" | "folder";
  children?: NoteNode[];
};

export class Navigation {
  editor?: YjsEditor;

  notesTree: NoteNode[] = [];
  notesMap: Record<string, Note> = {};
  activePath: string | null = null;

  navdiv = document.querySelector("nav") as HTMLElement;
  sidediv = document.querySelector("#sidebar") as HTMLElement;
  sidebar = new Sidebar(this.sidediv);

  // ────────────── Wiring ──────────────
  
  setEditor(editor: CMEditor) {
    this.editor = editor;
  }

  // ────────────── Panel controls ──────────────

  showNavigation() {
    this.updateFileList();
    if (this.navdiv) {
      this.navdiv.style.flexGrow = "1";
      this.navdiv.style.minWidth = "200px";
    }
  }

  closeNavigation() {
    if (this.navdiv) {
      this.navdiv.style.flexGrow = "0";
      this.navdiv.style.minWidth = "0px";
    }
  }

  showSidebar() {
    if (this.sidediv) {
      this.sidediv.style.flexGrow = "1";
      this.sidediv.style.minWidth = "200px";
    }
  }

  closeSidebar() {
    if (this.sidediv) {
      this.sidediv.style.flexGrow = "0";
      this.sidediv.style.minWidth = "0px";
    }
  }

  // ────────────── Navigation rendering ──────────────

  populateNavigation() {
    if (!this.navdiv) return;
    this.navdiv.innerHTML = "";
  
    const root = document.createElement("ul");
    root.className = "file-tree";
  
    const buildNode = (
      node: NoteNode,
      container: HTMLElement,
      parentPath = ""
    ) => {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  
      const li = document.createElement("li");
      li.className = node.type === "folder" ? "folder" : "file";
      li.dataset.path = fullPath;
  
      const row = document.createElement("div");
      row.className = "item-row";
  
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = node.name.endsWith(".md")
        ? decodeURI(node.name.slice(0, -3))
        : decodeURI(node.name);
  
      row.appendChild(label);
      li.appendChild(row);
  
      if (node.type === "file") {
        row.addEventListener("click", async (e) => {
          e.stopPropagation();
  
          this.activePath = fullPath;
          await this.switchTab(fullPath);
          this.populateNavigation(); // re-render to update active state
        });
  
        if (this.activePath === fullPath) {
          li.classList.add("active");
        
          // mark all parents as active-branch
          let parent = li.parentElement?.closest("li.folder");
          while (parent) {
            parent.classList.add("active-branch");
            parent = parent.parentElement?.closest("li.folder");
          }
        }
      }
  
      if (node.type === "folder" && node.children) {
        const childrenUl = document.createElement("ul");
        childrenUl.className = "children";
  
        node.children.forEach(child =>
          buildNode(child, childrenUl, fullPath)
        );
  
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          li.classList.toggle("open");
        });
  
        // auto-open if active file is inside
        if (this.activePath?.startsWith(fullPath + "/")) {
          li.classList.add("open");
        }
  
        li.appendChild(childrenUl);
      }
  
      container.appendChild(li);
    };
  
    this.notesTree.forEach(node => buildNode(node, root));
    this.navdiv.appendChild(root);
  }

  // ────────────── File list ──────────────

  flattenTree(nodes: NoteNode[], parentPath = ""): Note[] {
    const out: Note[] = [];

    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${node.name}` : node.name;

      if (node.type === "folder" && node.children) {
        out.push(...this.flattenTree(node.children, path));
      }

      if (node.type === "file") {
        out.push({
          path,
          id: undefined,
          title: node.name.endsWith(".md")
            ? node.name.slice(0, -3)
            : node.name,
          frontmatter: undefined,
          dirty: false,
          lastLoadedAt: undefined,
        });
      }
    }

    return out;
  }

  async updateFileList() {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error(res.statusText);

      const tree = (await res.json()) as NoteNode[];
      this.notesTree = tree;

      this.notesMap = {};
      for (const note of this.flattenTree(tree)) {
        this.notesMap[note.path] = note;
      }
      setLS("all_notes", Object.keys(this.notesMap))
      
      this.populateNavigation();
    } catch (err) {
      console.error(err);
    }
  }

  // ────────────── Tab management ──────────────

  async switchTab(docId: string) {
    if (!this.editor) return;

    const clean = docId.replace(/\.md$/, "");
    this.setTabInPath(clean);

    // Open the document via DocumentManager
    const {documentManager, metadataIndexer} = getApp()
    const doc = await documentManager.open(clean, { online: true });
    
    // parse metadata //TODO: make that cache

    metadataIndexer.indexDocument(clean, await MetadataExtractor.extractMetadata(doc.text))
    // Use the editor method to switch document cleanly
    this.editor.switchDocument(doc);
    
    this.sidebar.load(docId)
    this.editor.focus();
  }
  async getFile(docId: string): Promise<string> {
    // Ensure the document is opened in the document manager
    const {documentManager} = getApp()
    const doc = await documentManager.open(docId, { online: true });
    return doc.ytext.toString();
  }
  async loadLastTab() {
    const fromPath = this.getTabFromPath();
    const fromLS = getLS<string>("lastTab");

    const tab = fromPath ?? fromLS;
    if (tab) {
      await this.switchTab(tab);
    } else {
      await this.switchTab("homepage")
    }
  }

  closeTab(_docId: string) {
    // no-op for now; editor just switches
  }

  // ────────────── Path helpers ──────────────

  private getTabFromPath(): string | null {
    const clean = window.location.pathname.replace(/^\/+/, "");
    return clean || null;
  }

  private setTabInPath(filename: string) {
    history.pushState({}, "", "/" + filename);
  }


  // ----------- Display search results ------------
  displaySearchResults(results: string[]) {
    this.hideSearchResults();
  
    const searchgroup = document.createElement("div");
    searchgroup.classList.add("searchgroup");
    searchgroup.id = "searchgroup";
  
    results.forEach(res => {
      const li = document.createElement("div");
      li.classList.add("search-item", "file");
  
      const row = document.createElement("div");
      row.classList.add("item-row");
  
      const label = document.createElement("span");
      label.classList.add("label");
      label.textContent = decodeURI(
        res.endsWith(".md") ? res.slice(0, -3) : res
      );
  
      row.appendChild(label);
      li.appendChild(row);
  
      if (this.activePath === res) {
        li.classList.add("active");
      }
  
      row.addEventListener("click", async (e) => {
        e.stopPropagation();
        this.hideSearchResults();
        this.activePath = res;
        await this.switchTab(res);
        this.populateNavigation();
      });
  
      searchgroup.appendChild(li);
    });
  
    this.navdiv.prepend(searchgroup);
  }

  hideSearchResults(){
    document.getElementById("searchgroup")?.remove()
    log.debug("tried to remove searchgroup")
  }
}
