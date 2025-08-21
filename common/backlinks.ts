// backlinks.ts
import { getMetadataStoreForTab } from './metadata.ts';
import { Wikilink } from './metadata.ts';
import { Logger } from './logger.ts';

const log = new Logger({ namespace: 'Backlinks', minLevel: 'debug' });

// Global map: key = page name, value = set of links pointing to it
const backlinksMap = new Map<string, Set<{ source: string; link: Wikilink }>>();

/**
 * Register outgoing wikilinks from a page.
 * Updates the global backlinks map.
 */
export function registerOutgoingLinks(sourcePage: string, wikilinks: Wikilink[]) {
  // Remove old outgoing links from this page
  for (const [target, links] of backlinksMap.entries()) {
    for (const link of Array.from(links)) {
      if (link.source === sourcePage) links.delete(link);
    }
    if (links.size === 0) backlinksMap.delete(target);
  }

  // Add new outgoing links
  wikilinks.forEach(link => {
    if (!backlinksMap.has(link.target)) backlinksMap.set(link.target, new Set());
    backlinksMap.get(link.target)!.add({ source: sourcePage, link });
  });

  // Update backlinks for all affected pages
  const affectedPages = new Set<string>([sourcePage, ...wikilinks.map(l => l.target)]);
  affectedPages.forEach(updatePageBacklinks);
}

/**
 * Update a single page's MetadataStore with backlinks pointing to it.
 */
export function updatePageBacklinks(pageName: string) {
  const store = getMetadataStoreForTab(pageName);
  if (!store) return;

  const incoming = backlinksMap.get(pageName);
  if (!incoming) {
    store.updateBacklinks([]);
    return;
  }

  const backlinks = Array.from(incoming).map(item => ({
    target: item.source,
    alias: item.link.alias,
    line: item.link.line,
    context: item.link.context
  }));

  store.updateBacklinks(backlinks);
}

/**
 * Get all pages that link to a given page.
 */
export function getBacklinks(pageName: string): Wikilink[] {
  const incoming = backlinksMap.get(pageName);
  if (!incoming) return [];
  return Array.from(incoming).map(item => ({
    target: item.source,
    alias: item.link.alias,
    line: item.link.line,
    context: item.link.context
  }));
}

/**
 * Utility to debug the backlinks map
 */
export function logBacklinks() {
  log.debug("Backlinks Map:");
  for (const [target, links] of backlinksMap.entries()) {
    log.debug(`Page: ${target}`);
    links.forEach(l => log.debug(`  ← ${l.source} [line ${l.link.line}]`));
  }
}
