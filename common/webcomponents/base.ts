// components/base.ts
import type { VNObject } from "../sidebar.ts";

export abstract class VNComponent extends HTMLElement {
  protected _data!: VNObject;

  set data(obj: VNObject) {
    this._data = obj;
    this.render();
  }

  protected abstract render(): void;

  protected getBaseStyles() {
    return `
      
        :host {
          display: block;
        }

        .card {
          display: flex;
          flex-direction: row;
          align-items: center;
          border: 1px solid var(--sidebar-border);
          border-radius: 8px;
          padding: 6px 10px;
          height: 64px;
          overflow: hidden;
          margin-bottom: 8px;
          font-family: system-ui, sans-serif;
          cursor: pointer;
          transition: 
            background 0.15s ease,
            border-color 0.15s ease,
            transform 0.05s ease;
        }

        .card:hover {
          background: var(--sidebar-hover);
          border-color: rgba(var(--cm-accent-color),0.4);
        }

        .card:active {
          transform: scale(0.98);
        }

        .description{
          font-size: 11px;
          color: var(--sidebar-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      
    `;
  }

  protected root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }
}