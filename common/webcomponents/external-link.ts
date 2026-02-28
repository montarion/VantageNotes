// components/vn-external-link.ts
import { VNComponent } from "./base.ts";
import type { VNObject } from "../sidebar.ts";

class VNExternalLink extends VNComponent {
  protected render() {
    const { title, properties } = this._data;

    this.root.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        .panel{
          display: flex;
          flex-direction: column
        }
        h4 {
          margin-block: 0.5em;
        }
        p {
          margin-block: 0;
        }
        img {
          max-width:100%;
          max-height:100%;
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
        ${
          properties.image
            ? `<img src="https://previewproxy.jamirograntsaan.nl/image?url=${encodeURIComponent(
                properties.image as string
              )}" />`
            : ""
        }
        <div class=panel>
          <h4>${title}</h4>
          <span class=description>${properties.description ?? ""}</span>
          
          
        </div>
      </div>
    `;

    // 👇 attach JS behavior
    this.root.querySelector(".card")!
      .addEventListener("click", this.handleClick);
  }

  private handleClick = () => {
    const { title, properties } = this._data;
    window.open(properties.url, '_blank').focus();
    //this.render(); // re-render with updated state
  };

  
}

customElements.define("vn-external-link", VNExternalLink);
