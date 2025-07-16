import {
  ViewPlugin,
  DecorationSet,
  EditorView,
  Decoration,
  keymap
} from "npm:@codemirror/view";
import { StateField } from "npm:@codemirror/state";
import { Logger } from '../common/logger.ts';

const log = new Logger({ namespace: 'Slashcommands', minLevel: 'debug' });

export const SlashCommandPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none;
  menuDOM: HTMLElement | null = null;
  currentMatch: RegExpMatchArray | null = null;
  slashCommands = [
    { name: "tag", label: "Insert a tag", insert: "#tag" },
    { name: "todo", label: "Insert a to-do", insert: "- [ ] " },
    { name: "today", label: "Insert today’s date", insert: `[[Dailies/${this.currentDate(new Date())}]]` },
    { name: "time", label: "Insert current time", insert: `${this.currentTime()}` },
    { name: "toggle task", label: "Toggle the current task", run: this.toggleCurrentTask },
    { name: "warning", label: "Insert warning callout", insert: "> **warning** Warning\n> "} 
  ];
  selectedIndex = 0;
  menuItems: HTMLElement[] = [];

  constructor(public view: EditorView) {
    this.updateMenu();
  }

  update(update: any) {
    if (update.docChanged || update.selectionSet) {
      this.updateMenu();
    }
  }

  updateMenu() {
    const { state } = this.view;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const textBeforeCursor = line.text.slice(0, pos - line.from);
    const match = textBeforeCursor.match(/\/([a-z]*)$/);

    this.currentMatch = match;
    this.removeMenu();

    if (match) {
      requestAnimationFrame(() => {
        const coords = this.view.coordsAtPos(pos);
        if (coords) this.showMenu(match[1], coords);
      });
    }
  }
  currentTime(): string {
    const date = new Date()
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  currentDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
  showMenu(query: string, coords: DOMRect) {
    this.removeMenu();
    this.selectedIndex = 0;

    const filtered = this.slashCommands.filter(c => c.name.startsWith(query));
    if (!filtered.length) return;

    const menu = document.createElement("div");
    menu.className = "cm-slash-menu";
    Object.assign(menu.style, {
      position: "absolute",
      top: `${coords.bottom + window.scrollY}px`,
      left: `${coords.left + window.scrollX}px`,
      zIndex: "1000",
      background: "white",
      border: "1px solid #ccc",
      padding: "4px",
      boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
    });

    filtered.forEach((cmd, idx) => {
      const item = document.createElement("div");
      item.textContent = `/${cmd.name} – ${cmd.label}`;
      item.className = "cm-slash-item";
      Object.assign(item.style, {
        padding: "4px",
        cursor: "pointer"
      });

      item.onclick = () => this.insertCommand(cmd);

      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    this.menuDOM = menu;
    this.menuItems = Array.from(menu.querySelectorAll(".cm-slash-item"));
    this.updateMenuHighlight();
  }

  updateMenuHighlight() {
    this.menuItems.forEach((item, idx) => {
      item.classList.toggle("selected", idx === this.selectedIndex);
      item.style.background = idx === this.selectedIndex ? "#eee" : "";
    });
  }

  selectItem(index: number): boolean {
    const filtered = this.slashCommands.filter(c =>
      this.currentMatch ? c.name.startsWith(this.currentMatch[1]) : false
    );
    if (!filtered.length || !filtered[index]) return false;
    return this.insertCommand(filtered[index]);
  }
  

  insertCommand(cmd: { name: string; insert?: string; run?: (view: EditorView) => void }): boolean {
    const { state, dispatch } = this.view;
    if (!this.currentMatch) return false;
  
    const pos = state.selection.main.head;
    const from = pos - this.currentMatch[0].length;
  
    if (cmd.run) {
      this.removeMenu();
      cmd.run(this.view);
      return true;
    }
  
    if (cmd.insert) {
      dispatch({
        changes: { from, to: pos, insert: cmd.insert },
        selection: { anchor: from + cmd.insert.length },
      });
      this.removeMenu();
      this.view.focus();
      return true;
    }
  
    return false;
  }

  toggleCurrentTask(view: EditorView) {
    const { state, dispatch } = view;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const text = line.text;
  
    const checkboxMatch = text.match(/^(\s*[-*] \[)( |x)(\])(.*)$/);
    if (!checkboxMatch) return;
  
    const [fullMatch, prefix, check, suffix, rest] = checkboxMatch;
    const toggle = check === " " ? "x" : " ";
    const newLine = `${prefix}${toggle}${suffix}${rest}`;
    log.warn(newLine)
  
    dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: newLine,
      }
    });
  
    view.focus();
  }
  removeMenu() {
    if (this.menuDOM) {
      this.menuDOM.remove();
      this.menuDOM = null;
      this.menuItems = [];
    }
  }

  destroy() {
    this.removeMenu();
  }
});

export const slashMenuKeymap = keymap.of([
  {
    key: "ArrowDown",
    run: (view) => {
      const plugin = view.plugin(SlashCommandPlugin);
      if (!plugin || !plugin.menuItems.length) return false;
      plugin.selectedIndex = (plugin.selectedIndex + 1) % plugin.menuItems.length;
      plugin.updateMenuHighlight();
      return true;
    }
  },
  {
    key: "ArrowUp",
    run: (view) => {
      const plugin = view.plugin(SlashCommandPlugin);
      if (!plugin || !plugin.menuItems.length) return false;
      plugin.selectedIndex = (plugin.selectedIndex - 1 + plugin.menuItems.length) % plugin.menuItems.length;
      plugin.updateMenuHighlight();
      return true;
    }
  },
  {
    key: "Enter",
    run: (view) => {
      const plugin = view.plugin(SlashCommandPlugin);
      if (!plugin || !plugin.menuItems.length) return false;
      return plugin.selectItem(plugin.selectedIndex); // now returns true if successful
    },
    preventDefault: true // <--- prevents default newline behavior
  },
  {
    key: "Escape",
    run: (view) => {
      const plugin = view.plugin(SlashCommandPlugin);
      if (plugin) plugin.removeMenu();
      return true;
    }
  }
]);
