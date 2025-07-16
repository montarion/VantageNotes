import { Logger } from './logger.ts';
import { loadFile } from './navigation.ts';
import { openEditorTab } from './tabs.ts';

const log = new Logger({ namespace: 'Metadata', minLevel: 'debug' });

async function getMetadata(filename: string) {
  const response = await loadFile(filename)
  return extractMetadataFromText(response)
}
export function extractMetadataFromText(text: string) {
  const wikilinks = [...text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].map(m => ({
    target: m[1],
    alias: m[2] || null
  }));

  const headers = [...text.matchAll(/^(#{1,6})\s+(.*)/gm)].map(m => ({
    level: m[1].length,
    text: m[2]
  }));

  const tasks = [...text.matchAll(/^[-*] \[( |x|X)\] (.+)/gm)].map(m => ({
    checked: m[1].toLowerCase() === 'x',
    text: m[2]
  }));

  const tags = [...new Set([...text.matchAll(/#(\w+)/g)].map(m => m[1]))];

  const hyperlinks = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => ({
    label: m[1],
    url: m[2]
  }));

  const code_blocks = [...text.matchAll(/```(\w+)?\n([\s\S]*?)```/g)].map(m => ({
    language: m[1] || 'plain',
    code: m[2]
  }));

  const images = [...text.matchAll(/!\[(.*?)\]\((.*?)\)/g)].map(m => ({
    alt_text: m[1],
    url: m[2]
  }));

  return {
    wikilinks,
    headers,
    tasks,
    tags,
    hyperlinks,
    code_blocks,
    images
  };
}

export async function showMetadataPanel(filename: string) {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) {
    log.error("sidebar element not found");
    return null;
  }
  sidebar.innerHTML = ""

  let panel = sidebar.querySelector(".search-result-panel") as HTMLElement | null;
  if (!panel) {
    panel = document.createElement("div")
    panel.classList.add(".search-result-panel")
    sidebar.append(panel)
  }
  

  panel.innerHTML = `
    <div class="panel">
      <div class="panel-header">Metadata (click to toggle)</div>
      <div class="panel-content" id="metadata-panel">
        <p>Loading metadata...</p>
      </div>
    </div>
  `;

  try {
    const metadata = await getMetadata(filename);
    const content = panel.querySelector(".panel-content")!;
    if (!metadata) {
      content.innerHTML = "<p>No metadata available</p>";
      return;
    }
    content.innerHTML = ""
    content.append(renderMetadata(metadata));
  } catch (e) {
    log.error("Failed to load metadata:", e);
    const content = panel.querySelector(".panel-content")!;
    content.innerHTML = "<p>Error loading metadata</p>";
  }
}

function renderMetadata(metadata: any): HTMLElement {
  const escape = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const createSection = (title: string, children: (HTMLElement | string)[]): HTMLElement => {
    const section = document.createElement("div");
    section.className = "panel";

    const header = document.createElement("div");
    header.className = "panel-header";
    header.textContent = `${title} (click to toggle)`;

    const content = document.createElement("div");
    content.className = "panel-content";

    if (children.length === 0) {
      content.textContent = "None";
    } else {
      for (const child of children) {
        if (typeof child === "string") {
          content.appendChild(document.createTextNode(child));
        } else {
          content.appendChild(child);
        }
      }
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
  };

  const renderTags = () => (metadata.tags || []).map((t: string, i: number) => {
    const tag = document.createElement("a");
    tag.href = "#";
    tag.className = "cm-tag";
    tag.dataset.tag = t;
    tag.textContent = `#${t}`;
    if (i > 0) return [document.createTextNode(", "), tag];
    return [tag];
  }).flat();

  const renderHeaders = () => (metadata.headers || []).map((h: any) => {
    const header = document.createElement("a");
    header.href = "#";
    header.className = "meta-header";
    header.dataset.header = h.text;
    header.textContent = `H${h.level}: ${h.text}`;
    return [header, document.createElement("br")];
  }).flat();

  const renderTasks = () => (metadata.tasks || []).map((t: any) => {
    const label = document.createElement("label");
    label.className = "meta-task";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = t.checked;
    checkbox.dataset.task = t.text;

    label.appendChild(checkbox);
    label.append(` ${t.text}`);

    return [label, document.createElement("br")];
  }).flat();

  const renderWikilinks = () => (metadata.wikilinks || []).map((w: any) => {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "cm-wikilink";
    link.dataset.wikilink = w.target;
    link.textContent = `[[${w.target}${w.alias ? `|${w.alias}` : ""}]]`;
    return [link, document.createElement("br")];
  }).flat();

  const renderLinks = () => (metadata.hyperlinks || []).map((l: any) => {
    const link = document.createElement("a");
    link.href = l.url;
    link.target = "_blank";
    link.className = "meta-link";
    link.textContent = l.label || l.url;
    return [link, document.createElement("br")];
  }).flat();

  const renderCodeLanguages = () => (metadata.code_blocks || []).map((c: any, i: number) => {
    const lang = document.createElement("a");
    lang.href = "#";
    lang.className = "meta-code";
    lang.dataset.codeLang = c.language || "plain";
    lang.textContent = c.language || "plain";
    if (i > 0) return [document.createTextNode(", "), lang];
    return [lang];
  }).flat();

  const renderImages = () => (metadata.images || []).map((img: any) => {
    const image = document.createElement("img");
    image.src = img.url;
    image.alt = img.alt_text || "";
    image.style.maxWidth = "100px";
    return image;
  });

  const container = document.createElement("div");

  if ((metadata.tags || []).length) container.appendChild(createSection("Tags", renderTags()));
  if ((metadata.headers || []).length) container.appendChild(createSection("Headers", renderHeaders()));
  if ((metadata.tasks || []).length) container.appendChild(createSection("Tasks", renderTasks()));
  if ((metadata.wikilinks || []).length) container.appendChild(createSection("Wikilinks", renderWikilinks()));
  if ((metadata.hyperlinks || []).length) container.appendChild(createSection("Links", renderLinks()));
  if ((metadata.code_blocks || []).length) container.appendChild(createSection("Languages", renderCodeLanguages()));
  if ((metadata.images || []).length) container.appendChild(createSection("Images", renderImages()));

  return container;
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
      openEditorTab({filename:`${link}.md`});
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
      if (fname) openEditorTab({filename:fname});
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
      const sidebar = document.querySelector(".sidebar");
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
          div.onclick = () => openEditorTab({filename:r.filename});
          content.appendChild(div);
        });
      }

      panel.appendChild(content);
      sidebar.appendChild(panel);
    });
}
