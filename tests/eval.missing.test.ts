// tests/eval.missing.test.ts
import { evaluate } from "../common/query/eval.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assertFalse } from "https://deno.land/std/assert/mod.ts";

Deno.test("missing field does not throw", () => {
  const expr: Expr = {
    type: "compare",
    field: "stats.nonexistent",
    op: ">",
    value: { type: "number", value: 1 },
  };

  assertFalse(evaluate(expr, baseNote));
});
