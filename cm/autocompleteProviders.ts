import { getApp } from "../common/app.ts";
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

export async function atNoteCompletion(context: CompletionContext) {
  const word = context.matchBefore(/@[\w/-]*/);

  if (!word) return null;

  // If not explicitly invoked and no @, don't show
  if (word.from === word.to && !context.explicit) return null;

  const query = word.text.slice(1).toLowerCase(); // remove @
  const { db } = getApp();
  const notes = await db.query(
    `SELECT document_id
     FROM frontmatter
     WHERE key = ?
       AND value = ?`,
    ["type", JSON.stringify("people")]
  );
  console.warn(notes)
  const options = notes
    .filter(note =>
      note.id.toLowerCase().includes(query) ||
      note.title.toLowerCase().includes(query)
    )
    .map(note => ({
      label: note.title,
      type: "text",
      info: note.id,
      apply: `@${note.id}`, // what gets inserted
    }));

  return {
    from: word.from,
    options,
  };
}