import { StateField, EditorState } from "npm:@codemirror/state";
import yaml from "npm:yaml";

export type FrontmatterState = {
  exists: boolean;
  from: number;
  to: number;
  raw: string;
  data: any | null;
};

function parseFrontmatter(state: EditorState): FrontmatterState {
    const doc = state.doc.toString();
  
    if (!doc.startsWith("---\n")) {
      return { exists: false, from: 0, to: 0, raw: "", data: null };
    }
  
    const end = doc.indexOf("\n---", 4);
    if (end === -1) {
      return { exists: false, from: 0, to: 0, raw: "", data: null };
    }
  
    const from = 0;
    const to = end + 4; // include closing ---
  
    const raw = doc.slice(4, end);
    let data = null;
  
    try {
      data = yaml.parse(raw);
    } catch {
      // malformed frontmatter is still frontmatter
    }
  
    return { exists: true, from, to, raw, data };
  }
  
export const frontmatterField = StateField.define<FrontmatterState>({
create(state) {
    return parseFrontmatter(state);
},

update(value, tr) {
    if (!tr.docChanged) return value;
    return parseFrontmatter(tr.state);
},
});