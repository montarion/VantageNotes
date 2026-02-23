// components/vn-external-link.ts
import { VNComponent } from "./base.ts";
import type { VNObject } from "../sidebar.ts";

class VNExternalLink extends VNComponent {
  protected render() {
    const { title, properties } = this._data;

    this.root.innerHTML = `
      <style>
        .card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          font-family: sans-serif;
        }

        img {
          width: 100%;
          border-radius: 6px;
          margin-top: 8px;
        }

        a {
          display: block;
          margin-top: 8px;
          color: #2563eb;
          text-decoration: none;
        }
      </style>

      <div class="card">
        <h3>${title}</h3>
        <p>${properties.description ?? ""}</p>
        ${
          properties.image
            ? `<img src="https://previewproxy.jamirograntsaan.nl/image?url=${encodeURIComponent(
                properties.image as string
              )}" />`
            : ""
        }
        <a href="${properties.url}" target="_blank">
          ${properties.url}
        </a>
      </div>
    `;
  }
}

customElements.define("vn-external-link", VNExternalLink);