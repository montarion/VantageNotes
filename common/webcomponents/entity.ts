// components/vn-entity.ts
import { VNComponent } from "./base.ts";

class VNEntity extends VNComponent {
  protected render() {
    const { title, properties } = this._data;
    console.warn(this._data)

    this.root.innerHTML = `
      <style>
      ${this.getBaseStyles()}
        

        .badge {
          background: #222;
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          margin-right: 6px;
        }

        .tag {
          background: #e5e7eb;
          padding: 3px 6px;
          border-radius: 6px;
          font-size: 12px;
          margin-right: 4px;
        }
      </style>

      <div class="card">
        <h3>${title}</h3>
        <div>
          <span class="badge">${properties.mentions ?? 0}</span>
        </div>
        <div>
          ${
            Array.isArray(properties.aliases)
              ? properties.aliases
                  .map(a => `<span class="tag">${a}</span>`)
                  .join("")
              : ""
          }
        </div>
      </div>
    `;
  }
}

customElements.define("vn-entity", VNEntity);