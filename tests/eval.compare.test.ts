// tests/eval.compare.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assert, assertFalse } from "https://deno.land/std/assert/mod.ts";

Deno.test("compare: number >", () => {
  const expr: Expr = {
    type: "compare",
    field: "stats.age",
    op: ">",
    value: { type: "number", value: 30 },
  };

  assert(evaluate(expr, baseNote));
});

Deno.test("compare: number <", () => {
  const expr: Expr = {
    type: "compare",
    field: "stats.age",
    op: "<",
    value: { type: "number", value: 30 },
  };

  assertFalse(evaluate(expr, baseNote));
});
