// transclusion.ts

// Regex to find transclusions ![[wikilink|alias]]
const TRANSCLUSION_REGEX = /!\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g;

type TransclusionResult = {
  original: string;       // the full match like '![[PageName|alias]]'
  target: string;         // PageName
  alias?: string;         // optional alias
  content?: string;       // fetched content HTML (filled after fetch)
};

/**
 * Parses the input text and returns an array of transclusion matches.
 */
export function parseTransclusions(text: string): TransclusionResult[] {
  const results: TransclusionResult[] = [];
  let match;
  while ((match = TRANSCLUSION_REGEX.exec(text)) !== null) {
    results.push({
      original: match[0],
      target: match[1].trim(),
      alias: match[2]?.trim(),
    });
  }
  return results;
}

/**
 * Fetch the content for a single transclusion target.
 * Replace this URL and fetching logic to fit your API.
 */
async function fetchTransclusionContent(target: string): Promise<string> {
  const res = await fetch(`/notes/${encodeURIComponent(target)}`);
  if (!res.ok) throw new Error(`Failed to fetch content for ${target}`);
  return await res.text();
}

/**
 * Given some text, parses transclusions, fetches their content,
 * and returns the text with transclusions replaced by the fetched content.
 */
export async function renderTransclusions(text: string): Promise<string> {
  const transclusions = parseTransclusions(text);

  let rendered = text;

  for (const t of transclusions) {
    try {
      const content = await fetchTransclusionContent(t.target);
      t.content = content;

      // If alias exists, show alias but content is from target
      const replacement = `
        <span class="transclusion" data-target="${t.target}">
          <span class="transclusion-alias">${t.alias || t.target}</span>
          <div class="transclusion-content">${content}</div>
        </span>
      `;

      // Replace ALL occurrences of this exact transclusion syntax with replacement
      // Use regex escape for the original string
      const escapedOriginal = t.original.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const replaceRegex = new RegExp(escapedOriginal, 'g');

      rendered = rendered.replace(replaceRegex, replacement);
    } catch (e) {
      console.warn(`Failed to fetch transclusion for ${t.target}:`, e);
      // On failure, fallback: just keep original text or indicate error
      rendered = rendered.replace(t.original, `<span class="transclusion-error">Failed to load transclusion: ${t.original}</span>`);
    }
  }

  return rendered;
}
