// tests/eval.contains.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assert, assertFalse } from "https://deno.land/std/assert/mod.ts";

Deno.test("contains: array hit", () => {
  const note = {
    ...baseNote,
    entities: {
      tags: ["todo", "work"],
    },
  };

  const expr: Expr = {
    type: "contains",
    field: "entities.tags",
    value: "todo",
  };

  assert(evaluate(expr, note));
});

Deno.test("contains: miss", () => {
  const expr: Expr = {
    type: "contains",
    field: "entities.tags",
    value: "done",
  };

  assertFalse(evaluate(expr, baseNote));
});
