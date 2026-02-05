// tests/explain.failure.test.ts
import { explain } from "../common/query/explain.ts";
import { printExplain } from "../common/query/explainPrint.ts";
import type { Expr } from "../common/query/ir.ts";
import { baseNote } from "./fixtures.ts";
import { assertStringIncludes } from "https://deno.land/std/assert/mod.ts";

Deno.test("explain: failing branch", () => {
  const expr: Expr = {
    type: "compare",
    field: "stats.age",
    op: "<",
    value: { type: "number", value: 10 },
  };

  const tree = explain(expr, baseNote);
  const text = printExplain(tree);

  assertStringIncludes(text, "✘");
  assertStringIncludes(text, "42 < 10");
});
