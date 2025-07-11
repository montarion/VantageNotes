import { Logger } from './logger.ts';
import { openEditorTab } from './tabs.ts';

const log = new Logger({ namespace: 'Metadata', minLevel: 'debug' });

async function getMetadata(filename: string) {
  const response = await fetch(`/api/metadata/${encodeURIComponent(filename)}`);
  if (!response.ok) {
    log.warn(`No metadata found for ${filename}`);
    return null;
  }
  return await response.json();
}

export async function showMetadataPanel(filename: string) {
  const container = document.querySelector("#metadata-panel-container") as HTMLElement;
  if (!container) return;

  container.innerHTML = `
    <div class="panel">
      <div class="panel-header">Metadata (click to toggle)</div>
      <div class="panel-content" id="metadata-panel">
        <p>Loading metadata...</p>
      </div>
    </div>
  `;

  try {
    const metadata = await getMetadata(filename);
    const content = container.querySelector(".panel-content")!;
    if (!metadata) {
      content.innerHTML = "<p>No metadata available</p>";
      return;
    }
    content.innerHTML = renderMetadata(metadata);
  } catch (e) {
    log.error("Failed to load metadata:", e);
    const content = container.querySelector(".panel-content")!;
    content.innerHTML = "<p>Error loading metadata</p>";
  }
}

function renderMetadata(metadata: any): string {
  const escape = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const section = (title: string, content: string) =>
    `<div class="panel">
       <div class="panel-header">${title} (click to toggle)</div>
       <div class="panel-content">${content}</div>
     </div>`;

     const tags = metadata.tags?.map((t: any) =>
        `<a href="#" class="cm-tag" data-tag="${escape(t)}">#${escape(t)}</a>`
      ).join(", ") || "None";

  const headers = metadata.headers?.map((h: any) =>
    `<a href="#" class="meta-header" data-header="${escape(h.text)}">H${h.level}: ${escape(h.text)}</a>`
  ).join("<br>") || "None";

  const tasks = metadata.tasks?.map((t: any) =>
    `<label class="meta-task"><input type="checkbox" disabled ${t.checked ? "checked" : ""} data-task="${escape(t.text)}"> ${escape(t.text)}</label>`
  ).join("<br>") || "None";

  const wikilinks = metadata.wikilinks?.map((w: any) =>
    `<a href="#" class="cm-wikilink" data-wikilink="${escape(w.target)}">[[${escape(w.target)}${w.alias ? `|${escape(w.alias)}` : ""}]]</a>`
  ).join("<br>") || "None";

  const links = metadata.hyperlinks?.map((l: any) =>
    `<a href="${escape(l.url)}" target="_blank" class="meta-link">${escape(l.label || l.url)}</a>`
  ).join("<br>") || "None";

  const codes = metadata.code_blocks?.map((c: any) =>
    `<a href="#" class="meta-code" data-code-lang="${escape(c.language || "plain")}">${escape(c.language || "plain")}</a>`
  ).join(", ") || "None";

  const images = metadata.images?.map((img: any) =>
    `<img src="${escape(img.url)}" alt="${escape(img.alt_text || '')}" style="max-width: 100px">`
  ).join(" ") || "None";

  return `
    ${section("Tags", tags)}
    ${section("Headers", headers)}
    ${section("Tasks", tasks)}
    ${section("Wikilinks", wikilinks)}
    ${section("Links", links)}
    ${section("Languages", codes)}
    ${section("Images", images)}
  `;
}

export async function showTagPanel(tag: string) {
  // Remove existing tag panels if any
  document.querySelectorAll(".search-result-panel[data-type='tag']").forEach(el => el.remove());

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const panel = document.createElement("div");
  panel.className = "search-result-panel panel";
  panel.dataset.type = "tag";

  panel.innerHTML = `
    <div class="panel-header">Tagged with: #${tag} (click to toggle)</div>
    <div class="panel-content">
      <p>Loading…</p>
    </div>
  `;

  sidebar.appendChild(panel);

  try {
    const response = await fetch(`/api/search?tag=${encodeURIComponent(tag)}`);
    const results = await response.json();

    const contentDiv = panel.querySelector('.panel-content');
    if (!contentDiv) return;

    if (!results.length) {
      contentDiv.innerHTML = `<p>No results found.</p>`;
      return;
    }

    contentDiv.innerHTML = `
      <ul class="tag-search-results">
        ${results.map((r: any) => `
          <li>
            <a href="#" class="tag-result-link" data-filename="${r.filename}">
              ${r.highlighted_filename || r.filename}
            </a>
          </li>
        `).join("")}
      </ul>
    `;

    // Clicks inside tag panel handled by delegated event below

  } catch (e) {
    console.error("Error loading tag panel:", e);
    const contentDiv = panel.querySelector('.panel-content');
    if (contentDiv) {
      contentDiv.innerHTML = `<p>Error loading tag data.</p>`;
    }
  }
}

// Setup event delegation for metadata panel and dynamically created tag panels
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // Toggle collapsible panels on panel-header click
  if (target.classList.contains("panel-header")) {
    const panel = target.parentElement;
    if (panel && panel.classList.contains("panel")) {
      panel.classList.toggle("collapsed");
      return;
    }
  }

  // Handle clicks inside metadata panel
  if (target.closest("#metadata-panel")) {
    // Tags
    if (target.matches("[data-tag]")) {
      e.preventDefault();
      const tag = target.dataset.tag!;
      showTagPanel(tag);
      return;
    }

    // Tasks
    if (target.matches("[data-task]")) {
      e.preventDefault();
      const task = target.dataset.task!;
      searchWithFilter({ task });
      return;
    }

    // Wikilinks
    if (target.matches("[data-wikilink]")) {
      e.preventDefault();
      const link = target.dataset.wikilink!;
      openEditorTab(`${link}.md`);
      return;
    }

    // Headers
    if (target.matches("[data-header]")) {
      e.preventDefault();
      const header = target.dataset.header!;
      searchWithFilter({ header });
      return;
    }

    // Code languages
    if (target.matches("[data-code-lang]")) {
      e.preventDefault();
      const lang = target.dataset.codeLang!;
      searchWithFilter({ codeLang: lang });
      return;
    }
  }

  // Handle clicks inside tag search panels
  if (target.closest(".search-result-panel[data-type='tag']")) {
    if (target.classList.contains("tag-result-link")) {
      e.preventDefault();
      const fname = target.dataset.filename;
      if (fname) openEditorTab(fname);
      return;
    }
  }
});

function searchWithFilter(filter: { task?: string; header?: string; codeLang?: string }) {
  const params = new URLSearchParams();
  if (filter.task) params.append("task", filter.task);
  if (filter.header) params.append("header", filter.header);
  if (filter.codeLang) params.append("code_lang", filter.codeLang);

  fetch(`/api/search?${params.toString()}`)
    .then(res => res.json())
    .then(results => {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return;

      // Remove previous refined search panels if any
      sidebar.querySelectorAll(".search-result-panel[data-type='refined']").forEach(el => el.remove());

      const panel = document.createElement("div");
      panel.className = "search-result-panel panel";
      panel.dataset.type = "refined";
      panel.innerHTML = `<div class="panel-header">Refined Search (click to toggle)</div>`;

      const content = document.createElement("div");
      content.className = "panel-content";

      if (!results.length) {
        content.innerHTML = `<p>No results found.</p>`;
      } else {
        results.forEach((r: any) => {
          const div = document.createElement("div");
          div.className = "search-result";
          div.innerHTML = `<a href="#">${r.filename}</a>`;
          div.onclick = () => openEditorTab(r.filename);
          content.appendChild(div);
        });
      }

      panel.appendChild(content);
      sidebar.appendChild(panel);
    });
}
