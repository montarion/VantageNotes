// tests/eval.realworld.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assert } from "https://deno.land/std/assert/mod.ts";

Deno.test("stale todo note", () => {
  const expr: Expr = {
    type: "and",
    left: {
      type: "compare",
      field: "flags.todo",
      op: "==",
      value: { type: "boolean", value: true },
    },
    right: {
      type: "compare",
      field: "stats.age",
      op: ">",
      value: { type: "number", value: 30 },
    },
  };

  assert(evaluate(expr, baseNote));
});
