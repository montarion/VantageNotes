import { autocompletion, CompletionContext, Completion } from "npm:@codemirror/autocomplete";
import { Logger } from '../common/logger.ts';
import { searchFuse } from "../common/navigation.ts";
;

const log = new Logger({ namespace: 'Autocomplete', minLevel: 'debug' });


export function fileLinkCompletions(context: CompletionContext) {
    const match = context.matchBefore(/\[\[([^\]]*)$/);
    if (!match) return null;
  
    const query = match.text.slice(2); // strip '[['
    const results = searchFuse(query)
  
    const options: Completion[] = results.map((result) => ({
      label: result.item.replace(".md", ""),
      type: "file",
    }));
  
    return {
      from: match.from + 2, // position after `[[`
      options,
      validFor: /^[^\]]*$/,
    };
}
  
  