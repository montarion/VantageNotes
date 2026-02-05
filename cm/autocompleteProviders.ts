import { getLS } from "../common/helpers.ts";
import { conditionalCompletion } from "./autocompleteFactory.ts";

import { autocompletion, CompletionContext } from "npm:@codemirror/autocomplete";

export const wikiLinkCompletion = (context: CompletionContext) => {
  // Match "[[" followed by any word chars (partial)
  const match = context.matchBefore(/\[\[\w*$/);
  if (!match) return null;

  // Optional: only open when user is typing or explicitly triggered
  if (match.from === match.to && !context.explicit) return null;

  const notes = getLS("all_notes"); // or await if async
  let opts = notes.map(n => ({
    label: n,
    type: "file",
  }))

  return {
    from: match.from + 2,
    options: notes.map(n => ({
      label: n,
      type: "file",
    })),
  };
};
//export const wikiLinkCompletion = conditionalCompletion(
//  {
//    match: /\[\[\w*$/,
//    replaceFrom: (m) => m.from + 2,
//  },
//  async () => {
//    const notes = getLS("all_notes"); // your index
//    console.log(notes)
//    return notes.map(n => ({
//      label: n.title,
//      type: "file",
//    }));
//  }
//  );