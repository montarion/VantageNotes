// com/queryPlugin.ts
import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { parseQueryDSL } from "./parser.ts"; // DSL → Expr

export const setQueryState = StateEffect.define<{
  expr: any | null;
  error: string | null;
}>();

export const queryStateField = StateField.define({
  create() {
    return { expr: null, error: null };
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setQueryState)) return e.value;
    }
    return value;
  },
});
