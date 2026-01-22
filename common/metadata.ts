// metadata.ts

import YAML from "npm:yaml";

export interface FrontmatterResult {
  raw: any | null;
  normalized?: any;
  range?: { start: number; end: number };
  error?: string;
}

export interface Metadata {
  frontmatter: FrontmatterResult | null;
  entities: Record<string, any>;
  semantics: Record<string, any>;
  links: Record<string, any>;
  structure: Record<string, any>;
  flags: Record<string, boolean>;
  stats: Record<string, number>;
}

export class MetadataExtractor {
  /* ────────────────────────────── */
  /* Frontmatter parsing            */
  /* ────────────────────────────── */
  static parseFrontmatter(text: string): FrontmatterResult | null {
    if (!text.startsWith("---")) return null;

    const end = text.indexOf("\n---", 3);
    if (end === -1) {
      return {
        raw: null,
        error: "Unterminated frontmatter",
        range: { start: 0, end: 3 },
      };
    }

    const fmStart = 3;
    const fmEnd = end;
    const rawBlock = text.slice(fmStart, fmEnd).trim();

    try {
      const raw = YAML.parse(rawBlock);

      const normalized: any = { ...raw };

      // simple normalization hooks
      if (typeof normalized.date === "string") {
        const d = new Date(normalized.date);
        if (!isNaN(d.getTime())) normalized.date = d.toISOString();
      }

      return {
        raw,
        normalized,
        range: { start: 0, end: end + 4 }, // include closing ---\n
      };
    } catch (err: any) {
      return {
        raw: null,
        error: err.message,
        range: { start: 0, end: end + 4 },
      };
    }
  }

  /* ────────────────────────────── */
  /* Metadata extraction            */
  /* ────────────────────────────── */
  static extractMetadata(text: string): Metadata {
    const frontmatter = this.parseFrontmatter(text);

    const bodyStart = frontmatter?.range?.end ?? 0;
    const body = text.slice(bodyStart);

    const entities: Record<string, any> = { people: {}, places: {}, organizations: {}, unknown: {} };
    const semantics: Record<string, any> = {};
    const links: Record<string, any> = { wikilinks: {}, transclusions: {}, external: {} };
    const structure: Record<string, any> = { headers: [], hasCode: false, hasQuotes: false, hasAdmonitions: [] };
    const flags: Record<string, boolean> = { draft: false, archived: false, pinned: false };

    /* ───── Entities (@thing|alias) ───── */
    const entityRe = /(?<!\S)@([^|\s]+)(?:\|([^\s]+))?/g;
    for (const m of body.matchAll(entityRe)) {
      const id = m[1];
      const alias = m[2];
      const bucket = "unknown";

      const entry = entities[bucket][id] ?? {
        mentions: 0,
        aliases: new Set<string>(),
        positions: [],
      };

      entry.mentions++;
      if (alias) entry.aliases.add(alias);
      entry.positions.push(bodyStart + (m.index ?? 0));

      entities[bucket][id] = entry;
    }

    // normalize alias sets
    for (const bucket of Object.values(entities)) {
      for (const k of Object.keys(bucket)) {
        bucket[k].aliases = Array.from(bucket[k].aliases);
      }
    }

    /* ───── Semantics (::a::b|alias) ───── */
    const semanticRe = /(?<!\S)::([^|\s]+(?:::[^|\s]+)*)(?:\|([^\s]+))?/g;
    for (const m of body.matchAll(semanticRe)) {
      const path = m[1];
      const entry = semantics[path] ?? { count: 0, positions: [] };
      entry.count++;
      entry.positions.push(bodyStart + (m.index ?? 0));
      semantics[path] = entry;
    }

    /* ───── Wikilinks [[note|alias]] ───── */
    const wikiRe = /(?<!!)\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
    for (const m of body.matchAll(wikiRe)) {
      const target = m[1];
      const alias = m[2];
      const entry = links.wikilinks[target] ?? {
        mentions: 0,
        aliases: new Set<string>(),
        positions: [],
      };
      entry.mentions++;
      if (alias) entry.aliases.add(alias);
      entry.positions.push(bodyStart + (m.index ?? 0));
      links.wikilinks[target] = entry;
    }

    /* ───── Transclusions ![[note]] ───── */
    const transRe = /!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
    for (const m of body.matchAll(transRe)) {
      const target = m[1];
      const entry = links.transclusions[target] ?? { mentions: 0, positions: [] };
      entry.mentions++;
      entry.positions.push(bodyStart + (m.index ?? 0));
      links.transclusions[target] = entry;
    }

    /* ───── External links ───── */
    const extRe = /\[[^\]]+\]\((https?:[^)]+)\)/g;
    for (const m of body.matchAll(extRe)) {
      const url = m[1];
      const entry = links.external[url] ?? { mentions: 0, positions: [] };
      entry.mentions++;
      entry.positions.push(bodyStart + (m.index ?? 0));
      links.external[url] = entry;
    }

    /* ───── Structure ───── */
    const headerRe = /(^|\n)(#{1,6})\s+([^\n]+)/g;
    for (const m of body.matchAll(headerRe)) {
      structure.headers.push({
        level: m[2].length,
        text: m[3],
        position: bodyStart + (m.index ?? 0),
      });
    }

    structure.hasCode = /```/.test(body);
    structure.hasQuotes = /^>+/m.test(body);
    structure.hasAdmonitions = Array.from(body.matchAll(/^!!!\s+(\w+)/gm)).map(m => m[1]);

    /* ───── Flags from frontmatter ───── */
    if (frontmatter?.raw) {
      for (const k of Object.keys(flags)) {
        if (typeof frontmatter.raw[k] === "boolean") {
          flags[k] = frontmatter.raw[k];
        }
      }
    }

    /* ───── Stats ───── */
    const stats = {
      wordCount: body.trim() ? body.trim().split(/\s+/).length : 0,
      charCount: body.length,
      entityCount: Object.values(entities.unknown).length,
      semanticCount: Object.keys(semantics).length,
      linkCount:
        Object.keys(links.wikilinks).length +
        Object.keys(links.transclusions).length +
        Object.keys(links.external).length,
    };

    return {
      frontmatter,
      entities,
      semantics,
      links,
      structure,
      flags,
      stats,
    };
  }
}
