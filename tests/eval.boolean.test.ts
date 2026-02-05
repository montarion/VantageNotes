// tests/eval.boolean.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assert } from "https://deno.land/std/assert/mod.ts";

Deno.test("compare: boolean flag", () => {
  const expr: Expr = {
    type: "compare",
    field: "flags.todo",
    op: "==",
    value: { type: "boolean", value: true },
  };

  assert(evaluate(expr, baseNote));
});
