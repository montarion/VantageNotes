import { openEditorTab } from "./tabs.ts";
import { Logger } from "./logger.ts";
import { renderTransclusions } from "./transclusion.ts";

const log = new Logger({ namespace: "Search" });

let resultsList: HTMLElement | null = null;

function ensureSearchResultPanel(): HTMLElement | null {
  const sidebar = document.querySelector(".navigation");
  if (!sidebar) {
    log.error("Navigation element not found");
    return null;
  }

  let panel = sidebar.querySelector(".search-result-panel") as HTMLElement | null;
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "search-result-panel";

    const title = document.createElement("h4");
    title.textContent = "Search Results";
    panel.appendChild(title);

    resultsList = document.createElement("div");
    resultsList.id = "search-results-list";
    panel.appendChild(resultsList);

    sidebar.prepend(panel);
  } else {
    resultsList = panel.querySelector("#search-results-list")!;
  }

  return panel;
}

async function renderSearchResults(results: any[]) {
    if (!resultsList) return;
  
    resultsList.innerHTML = "";
  
    if (!results.length) {
      resultsList.innerHTML = "<p>No results found.</p>";
      return;
    }
  
    for (const result of results) {
      // Render transclusions inside metadata and content snippets:
      const renderedMetadata = result.highlighted_metadata
        ? await renderTransclusions(result.highlighted_metadata)
        : "—";
  
      const renderedContent = result.highlighted_content
        ? await renderTransclusions(result.highlighted_content)
        : "—";
  
      const div = document.createElement("div");
      div.className = "search-result";
      div.innerHTML = `
        <div class="filename"><strong>${result.highlighted_filename}</strong></div>
        <div class="meta-snippet"><em>Meta:</em> ${renderedMetadata}</div>
        <div class="content-snippet"><em>Text:</em> ${renderedContent}</div>
      `;
  
      div.onclick = () => {
        openEditorTab({paneId:"search", filename:result.filename});
      };
  
      resultsList.appendChild(div);
    }
  }
  

export function setupSearchHandler() {
  const input = document.getElementById("search-input") as HTMLInputElement;
  if (!input) {
    log.error("Search input not found");
    return;
  }

  input.addEventListener("input", async () => {
    const query = input.value.trim();

    // Remove search results panel if query is empty
    if (!query) {
      const existingPanel = document.querySelector(".search-result-panel");
      if (existingPanel) {
        existingPanel.remove();
      }
      resultsList = null;
      return;
    }

    // Create or get search results panel
    const panel = ensureSearchResultPanel();
    if (!panel || !resultsList) return;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error(`Search API error: ${res.statusText}`);
      }
      const results = await res.json();
      await renderSearchResults(results);
    } catch (err) {
      log.error("Search failed", err);
      resultsList.innerHTML = "<p>Error fetching search results.</p>";
    }
  });
}

function styleTagsAndWikilinks(text: string): string {
    if (!text) return "";
  
    // Replace tags (e.g., #tag) with <a class="cm-tag" data-tag="tag">#tag</a>
    text = text.replace(/#([\w-]+)/g, (match, tag) => {
      return `<a href="#" class="cm-tag" data-tag="${tag}">#${tag}</a>`;
    });
  
    // Replace wikilinks [[target|alias]] or [[target]] with <a class="cm-wikilink" data-wikilink="target">[[target|alias]]</a>
    text = text.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, target, _pipeAlias, alias) => {
      const display = alias ? `${target}|${alias}` : target;
      return `<a href="#" class="cm-wikilink" data-wikilink="${target}">[[${display}]]</a>`;
    });
  
    return text;
  }
