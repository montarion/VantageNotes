import { VNComponent } from "./base.ts";
import type { VNObject } from "../sidebar.ts";


class VNWikilink extends VNComponent {
  protected render() {
    const { title, properties } = this._data;

    const mentions = properties.mentions ?? 0;
    const aliases = properties.aliases ?? {};

    const aliasList =
      aliases && Object.keys(aliases).length > 0
        ? Object.keys(aliases)
        : [];

    // Extract last segment for nicer display
    const segments = title.split("/");
    const displayName = segments[segments.length - 1];

    this.root.innerHTML = `
      <style>
      ${this.getBaseStyles()}
        .panel {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }

        .title {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        

        .meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }

        .badge {
          background: var(--sidebar-badge-bg);
          color: var(--sidebar-badge-color);
          padding: 2px 6px;
          border-radius: 12px;
          font-size: 11px;
        }

        .tag {
          background: var(--sidebar-tag-bg);
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 11px;
        }
      </style>

      <div class="card">
        <div class="panel">
          <div class="title">${displayName}</div>
          <div class="description">${title}</div>

          <div class="meta">
            <span class="badge">${mentions}</span>
            ${
              aliasList.length > 0
                ? aliasList
                    .map(a => `<span class="tag">${a}</span>`)
                    .join("")
                : ""
            }
          </div>
        </div>
      </div>
    `;

    this.root.querySelector(".card")!
      .addEventListener("click", this.handleClick);
  }

  private handleClick = () => {
    // Instead of navigating directly,
    // emit event so Sidebar or Editor decides what to do.
    console.log(this._data.title)
    window.nav.switchTab(this._data.title)
    this.dispatchEvent(
      new CustomEvent("vn-open-wikilink", {
        detail: {
          path: this._data.title,
          positions: this._data.properties.positions ?? []
        },
        bubbles: true,
        composed: true
      })
    );
  };
}

customElements.define("vn-wikilink", VNWikilink);