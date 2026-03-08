// sidebar.ts
// MVP Sidebar for VantageNotes
// ---------------------------------------
// Responsibilities:
// 1. Ask backend which objects belong to current note
// 2. Render a card for each object
// 3. Keep rendering logic simple + replaceable later
// ---------------------------------------

import { Metadata, MetadataExtractor } from "./metadata.ts";
import "./webcomponents/index.ts"
import { Logger } from "./logger.ts";
import { getApp } from "./app.ts";
import { ViewPlugin } from "npm:@codemirror/view";

const log = new Logger({ namespace: "Sidebar" });




export interface FieldDefinition {
  key: string;                  // property key
  label?: string;               // optional label override
  type?: "text" | "badge" | "tags" | "link" | "image";
  hideIfEmpty?: boolean;
}

export interface RenderDefinition {
  layout: "default" | "link-preview" | "compact";
  icon?: string;
  fields: FieldDefinition[];
}

const RENDERERS: Record<string, RenderDefinition> = {
  "external-link": {
    layout: "link-preview",
    icon: "🌍",
    fields: [
      { key: "title" },
      { key: "description" },
      { key: "image", type: "image" },
      { key: "url", type: "link" }
    ]
  },

  "entity": {
    layout: "default",
    icon: "👤",
    fields: [
      { key: "mentions", type: "badge" },
      { key: "aliases", type: "tags" }
    ]
  },

  "wikilink": {
    layout: "compact",
    icon: "🔗",
    fields: [
      { key: "mentions", type: "badge" },
      { key: "aliases", type: "tags" }
    ]
  }
};

/**
 * Base object type returned from backend.
 * This should mirror your VNObject interface in backend.
 */
export interface VNObject {
    id: string;             // uuidv7
    type: string;           // "person" | "project" | "task" | ...
    title: string;
    properties: Record<string, unknown>;
    template?: string;      // optional template name stored in DB
  }
  

  /**
   * Sidebar controller class.
   * Responsible for fetching + rendering.
   */
  export class Sidebar {
    private container: HTMLElement;
    private currentNoteId: string | null = null;
  
    private pageComponent: any | null = null;
    private objectMap = new Map<string, HTMLElement>();
    private updateTimer: number | null = null;
    unsubscribe?: () => void;

    constructor(container: HTMLElement) {
      this.container = container;
      
    }
  
    /**
     * Public method to load sidebar for a specific note.
     * Call this whenever the active document changes.
     */
    async load(noteId: string) {
      this.currentNoteId = noteId;
    
      const { documentManager } = getApp();
      const text = await documentManager.getText(noteId);
      const metadata = await MetadataExtractor.extractMetadata(text);
    
      /* create page component once */
      if (!this.pageComponent) {
        this.pageComponent = document.createElement("vn-page") as any;
        this.container.appendChild(this.pageComponent);
      }
    
      this.pageComponent.data = {
        id: noteId,
        type: "page",
        title: noteId,
        properties: { metadata }
      };
    
      const objects = await this.buildObjectsFromMetadata(metadata);
    
      this.updateObjects(objects);
    }
    private updateObjects(objects: VNObject[]) {
      const seen = new Set<string>();
    
      for (const obj of objects) {
        seen.add(obj.id);
    
        let el = this.objectMap.get(obj.id);
    
        if (!el) {
          el = this.createObjectCard(obj);
          this.objectMap.set(obj.id, el);
          this.container.appendChild(el);
        } else {
          (el as any).data = obj;
        }
      }
    
      /* remove deleted objects */
      for (const [id, el] of this.objectMap) {
        if (!seen.has(id)) {
          el.remove();
          this.objectMap.delete(id);
        }
      }
    }

    scheduleUpdate() {
      if (this.updateTimer) clearTimeout(this.updateTimer);
    
      this.updateTimer = window.setTimeout(() => {
        if (!this.currentNoteId) return;
        this.load(this.currentNoteId);
      }, 120);
    }

    private async buildObjectsFromMetadata(metadata: Metadata): Promise<VNObject[]> {
      const objects: VNObject[] = [];
    
      /* ───── Wikilinks → link objects ───── */
      for (const [target, data] of Object.entries(metadata.links.wikilinks)) {
        objects.push({
          id: `wiki:${target}`,
          type: "wikilink",
          title: target,
          properties: {
            mentions: (data as any).mentions,
            aliases: (data as any).aliases,
          },
        });
      }
    
      /* ───── External links ───── */
      for (const [url, data] of Object.entries(metadata.links.external)) {
        let realurl = `https://previewproxy.jamirograntsaan.nl/preview?url=${encodeURIComponent(url)}`
        const preogpdata = await fetch(realurl, {
            method: "GET",
            mode: "cors",           // enable cross-origin requests
            credentials: "include"
          }
        )
        const meta = await preogpdata.json()
        objects.push({
          id: `ext:${url}`,
          type: "external-link",
          title: meta.title,
          properties: {
            mentions: (data as any).mentions,
            description: meta.description,
            url: meta.url,
            image: meta.image
          },
        });
      }
    
      /* ───── Entities (@thing) ───── */
      for (const [id, data] of Object.entries(metadata.entities.unknown)) {
        objects.push({
          id: `entity:${id}`,
          type: "entity",
          title: id,
          properties: {
            mentions: (data as any).mentions,
            aliases: (data as any).aliases,
          },
        });
      }
    
      /* ───── Semantics (::path::to::thing) ───── */
      for (const [path, data] of Object.entries(metadata.semantics)) {
        objects.push({
          id: `semantic:${path}`,
          type: "semantic",
          title: path,
          properties: {
            count: (data as any).count,
          },
        });
      }
    
      return objects;
    }
  
    /**
     * Creates a simple object card.
     * Representation details (like which properties to show)
     * should eventually come from DB templates.
     */
    private createObjectCard(obj: VNObject): HTMLElement {
      const tag = `vn-${obj.type}`;
    
      if (!customElements.get(tag)) {
        log.warn(`No component registered for ${obj.type}`);
        return this.renderDefault(obj, {
          layout: "default",
          fields: Object.keys(obj.properties).map(k => ({ key: k }))
        });
      }
    
      const el = document.createElement(tag) as any;
      el.data = obj;
    
      return el;
    }

    private renderDefault(obj: VNObject, def: RenderDefinition): HTMLElement {
      const card = document.createElement("div");
      card.classList.add("vn-sidebar-card");
    
      const title = document.createElement("h3");
      title.textContent = obj.title;
      card.appendChild(title);
    
      const body = document.createElement("div");
      body.classList.add("vn-sidebar-card-body", def.layout);

    
      for (const field of def.fields) {
        const value = obj.properties[field.key];
        if (field.hideIfEmpty && !value) continue;
    
        const row = document.createElement("div");
        row.classList.add("vn-sidebar-card-row", field.type);
    
        const label = document.createElement("strong");
        label.textContent = field.label ?? field.key;
        const val = this.renderFieldValue(value, field.type);
    
        row.appendChild(label);
        row.appendChild(val);
        body.appendChild(row);
      }
    
      card.appendChild(body);
      return card;
    }

    private renderFieldValue(value: any, type?: string): HTMLElement {
      const el = document.createElement("span");
    
      if (!type) {
        el.textContent = String(value);
        return el;
      }
    
      switch (type) {
        case "badge":
          el.classList.add("vn-badge");
          el.textContent = String(value);
          break;
    
        case "tags":
          el.classList.add("vn-tags");
          if (Array.isArray(value)) {
            value.forEach(v => {
              const tag = document.createElement("span");
              tag.classList.add("vn-tag");
              tag.textContent = v;
              el.appendChild(tag);
            });
          }
          break;
    
        case "link":
          const a = document.createElement("a");
          a.href = value;
          a.textContent = value;
          a.target = "_blank";
          el.appendChild(a);
          break;
    
        case "image":
          const img = document.createElement("img");
          img.src = `https://previewproxy.jamirograntsaan.nl/image?url=${encodeURIComponent(value)}`;;
          img.classList.add("vn-image");
          el.appendChild(img);
          break;
    
        default:
          el.textContent = String(value);
      }
    
      return el;
    }
  

    /**
     * Clears sidebar contents.
     */
    private clear() {
      this.container.innerHTML = "";
    }

    
  }